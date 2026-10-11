import { describe, it, expect } from 'vitest'
import { World } from './world'
import { exec } from './shell'
import { requireRepo, headHash, status, branches } from './repo'
import { createHubRepo, hubCommit, openPR, prState, mergePR, forkRepo, createIssue } from './hub'
import { merge3, unifiedDiff } from './diff'

const run = (w: World, ...cmds: string[]) => cmds.map((c) => exec(w, c).lines.map((l) => l.map((s) => s.t).join('')).join('\n'))
const last = (w: World, ...cmds: string[]) => run(w, ...cmds).at(-1)!

function fresh() {
  const w = new World()
  run(w, 'mkdir project', 'cd project', 'git init', 'echo "hello" > a.txt', 'git add a.txt', 'git commit -m "first"')
  return w
}

describe('diff', () => {
  it('merge3 clean and conflict', () => {
    expect(merge3('a\nb\nc\n', 'A\nb\nc\n', 'a\nb\nC\n')).toEqual({ content: 'A\nb\nC\n', conflict: false })
    const c = merge3('a\nb\n', 'x\nb\n', 'y\nb\n', 'HEAD', 'feat')
    expect(c.conflict).toBe(true)
    expect(c.content).toBe('<<<<<<< HEAD\nx\n=======\ny\n>>>>>>> feat\nb\n')
  })
  it('unified diff hunks', () => {
    const d = unifiedDiff('f', 'a\nb\nc\n', 'a\nB\nc\n').map((l) => l.text)
    expect(d).toContain('@@ -1,3 +1,3 @@')
    expect(d).toContain('-b')
    expect(d).toContain('+B')
  })
})

describe('shell + basics', () => {
  it('init, add, commit, status, log', () => {
    const w = fresh()
    expect(last(w, 'git status')).toContain('nothing to commit, working tree clean')
    expect(last(w, 'git log --oneline')).toMatch(/^[0-9a-f]{7} \(HEAD -> main\) first$/)
    expect(last(w, 'ls -a')).toContain('.git')
    expect(last(w, 'cat .git/HEAD')).toBe('ref: refs/heads/main')
    run(w, 'echo "more" >> a.txt')
    expect(last(w, 'git status -s')).toBe(' M a.txt')
    expect(last(w, 'git diff')).toContain('+more')
    run(w, 'git add .')
    expect(last(w, 'git status -s')).toBe('M  a.txt')
    expect(last(w, 'git diff --staged')).toContain('+more')
    run(w, 'git restore --staged a.txt')
    expect(last(w, 'git status -s')).toBe(' M a.txt')
    run(w, 'git restore a.txt')
    expect(last(w, 'cat a.txt')).toBe('hello')
  })
  it('errors', () => {
    const w = new World()
    expect(last(w, 'git status')).toContain('not a git repository')
    expect(last(w, 'cd nope')).toContain('no such file')
    expect(last(w, 'foo')).toContain('command not found')
  })
  it('amend and reset', () => {
    const w = fresh()
    run(w, 'echo b > b.txt', 'git add b.txt', 'git commit -m "secnd"', 'git commit --amend -m "second"')
    expect(last(w, 'git log --oneline')).toMatch(/second\n.*first$/)
    run(w, 'git reset --soft HEAD~1')
    expect(last(w, 'git status -s')).toBe('A  b.txt')
    run(w, 'git reset')
    expect(last(w, 'git status -s')).toBe('?? b.txt')
    run(w, 'git add b.txt', 'git commit -m "second"', 'git reset --hard HEAD~1')
    expect(last(w, 'ls')).toBe('a.txt')
    expect(last(w, 'git reflog')).toContain('reset: moving to HEAD~1')
  })
})

describe('branches and merging', () => {
  it('fast-forward', () => {
    const w = fresh()
    run(w, 'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m "feat"', 'git switch main')
    expect(last(w, 'ls')).toBe('a.txt')
    expect(last(w, 'git merge feature')).toContain('Fast-forward')
    expect(last(w, 'ls')).toBe('a.txt  f.txt')
    expect(last(w, 'git branch -d feature')).toContain('Deleted branch feature')
  })
  it('three-way merge and conflict resolution', () => {
    const w = fresh()
    run(w, 'git switch -c feature', 'echo "feature line" > a.txt', 'git commit -am "feat"', 'git switch main', 'echo "main line" > a.txt', 'git commit -am "main"')
    const m = last(w, 'git merge feature')
    expect(m).toContain('CONFLICT (content): Merge conflict in a.txt')
    expect(last(w, 'cat a.txt')).toBe('<<<<<<< HEAD\nmain line\n=======\nfeature line\n>>>>>>> feature')
    expect(last(w, 'git status')).toContain('both modified:   a.txt')
    expect(last(w, 'git commit -m x')).toContain('unmerged files')
    run(w, 'echo resolved > a.txt', 'git add a.txt')
    expect(last(w, 'git commit -m "merge"')).toContain('[main')
    const r = requireRepo(w)
    expect(w.commit(headHash(r)!).parents.length).toBe(2)
    expect(last(w, 'git log --oneline --graph')).toContain('*')
  })
  it('merge commit without conflict', () => {
    const w = fresh()
    run(w, 'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m "feat"', 'git switch main', 'echo b > b.txt', 'git add .', 'git commit -m "b"')
    expect(last(w, 'git merge feature')).toContain("Merge made by the 'ort' strategy.")
    expect(last(w, 'ls')).toBe('a.txt  b.txt  f.txt')
  })
  it('refuses switch that would clobber', () => {
    const w = fresh()
    run(w, 'git switch -c feature', 'echo f > a.txt', 'git commit -am "feat"', 'git switch main', 'echo dirty > a.txt')
    expect(last(w, 'git switch feature')).toContain('would be overwritten by checkout')
    run(w, 'git stash')
    expect(last(w, 'git switch feature')).toContain("Switched to branch 'feature'")
    run(w, 'git switch main')
    expect(last(w, 'git stash pop')).toContain('modified:   a.txt')
    expect(last(w, 'cat a.txt')).toBe('dirty')
  })
  it('rebase linear and with conflict', () => {
    const w = fresh()
    run(w, 'git switch -c feature', 'echo f > f.txt', 'git add .', 'git commit -m "feat"', 'git switch main', 'echo b > b.txt', 'git add .', 'git commit -m "b"', 'git switch feature')
    expect(last(w, 'git rebase main')).toContain('Successfully rebased')
    expect(last(w, 'git log --oneline')).toMatch(/feat\n.* b\n.* first$/)
    expect(last(w, 'ls')).toBe('a.txt  b.txt  f.txt')
    // conflict
    run(w, 'git switch main', 'echo m > a.txt', 'git commit -am "main a"', 'git switch feature', 'echo f > a.txt', 'git commit -am "feat a"')
    expect(last(w, 'git rebase main')).toContain('CONFLICT')
    expect(last(w, 'git status')).toContain('rebase in progress')
    run(w, 'echo both > a.txt', 'git add a.txt')
    expect(last(w, 'git rebase --continue')).toContain('Successfully rebased')
    expect(last(w, 'cat a.txt')).toBe('both')
    expect(last(w, 'git log --oneline')).toMatch(/feat a\n.* feat\n.* main a/)
  })
  it('revert and cherry-pick', () => {
    const w = fresh()
    run(w, 'echo b > b.txt', 'git add .', 'git commit -m "add b"')
    expect(last(w, 'git revert HEAD')).toContain('Revert "add b"')
    expect(last(w, 'ls')).toBe('a.txt')
    run(w, 'git switch -c side', 'echo c > c.txt', 'git add .', 'git commit -m "add c"', 'git switch main')
    expect(last(w, 'git cherry-pick side')).toContain('add c')
    expect(last(w, 'ls')).toBe('a.txt  c.txt')
  })
  it('tags and detached HEAD', () => {
    const w = fresh()
    run(w, 'git tag v1', 'echo b > b.txt', 'git add .', 'git commit -m "b"')
    expect(last(w, 'git tag')).toBe('v1')
    expect(last(w, 'git checkout v1')).toContain('detached HEAD')
    expect(last(w, 'ls')).toBe('a.txt')
    expect(last(w, 'git switch -')).toContain("Switched to branch 'main'")
  })
})

describe('remotes + hub', () => {
  it('push, clone, fetch, pull, reject', () => {
    const w = fresh()
    createHubRepo(w, 'you', 'project')
    run(w, 'git remote add origin https://github.com/you/project.git')
    expect(last(w, 'git push')).toContain('has no upstream branch')
    expect(last(w, 'git push -u origin main')).toContain("branch 'main' set up to track 'origin/main'")
    expect(last(w, 'git status')).toContain("up to date with 'origin/main'")
    // clone elsewhere
    run(w, 'cd ~', 'git clone https://github.com/you/project.git copy', 'cd copy')
    expect(last(w, 'ls')).toBe('a.txt')
    expect(last(w, 'git log --oneline')).toContain('origin/main')
    // teammate pushes
    hubCommit(w, w.hub.repos['you/project'], 'main', { 'maya.txt': 'hi\n' }, 'maya adds file')
    run(w, 'echo mine > mine.txt', 'git add .', 'git commit -m "mine"')
    expect(last(w, 'git push')).toContain('[rejected]')
    expect(last(w, 'git pull')).toContain('divergent branches')
    expect(last(w, 'git pull --rebase')).toContain('Successfully rebased')
    expect(last(w, 'git push')).toMatch(/main -> main/)
    run(w, 'cd ~/project')
    expect(last(w, 'git fetch')).toContain('main       -> origin/main')
    expect(last(w, 'git status')).toContain('behind')
    expect(last(w, 'git pull')).toContain('Fast-forward')
    expect(last(w, 'ls')).toBe('a.txt  maya.txt  mine.txt')
  })
  it('PR flow with issue + CI + protection', () => {
    const w = new World()
    const hub = createHubRepo(w, 'octo-org', 'lib', { readme: true, files: { 'lib.js': 'export const x = 1\n' } })
    hub.ci = (files) => ({ ok: !/TODO/.test(files['lib.js'] ?? ''), log: ['lint'] })
    hub.protection = { branch: 'main', requirePR: true, requireChecks: true }
    const issue = createIssue(w, hub, { title: 'x should be 2', body: '' })
    forkRepo(w, 'octo-org/lib', 'you')
    run(w, 'git clone https://github.com/you/lib.git', 'cd lib', 'git switch -c fix-x', 'echo "export const x = 2 // TODO" > lib.js', 'git commit -am "fix x"', 'git push -u origin fix-x')
    const pr = openPR(w, 'octo-org/lib', { title: 'Fix x', body: `Fixes #${issue.number}`, headRepo: 'you/lib', headBranch: 'fix-x', base: 'main' })
    let st = prState(w, hub, pr)
    expect(st.checks.ok).toBe(false)
    expect(st.mergeable).toBe(false)
    run(w, 'echo "export const x = 2" > lib.js', 'git commit -am "remove todo"', 'git push')
    st = prState(w, hub, pr)
    expect(st.mergeable).toBe(true)
    expect(st.commits.length).toBe(2)
    mergePR(w, hub, pr.number, 'squash')
    expect(hub.issues[0].state).toBe('closed')
    expect(branches(hub.repo)).toEqual(['main'])
    // direct push to protected main rejected
    run(w, 'git remote add upstream https://github.com/octo-org/lib.git', 'git fetch upstream', 'git switch main', 'git merge upstream/main', 'echo x > direct.txt', 'git add .', 'git commit -m "direct"')
    expect(last(w, 'git push upstream main')).toContain('protected branch hook declined')
    expect(status(w, requireRepo(w)).staged.length).toBe(0)
  })
})
