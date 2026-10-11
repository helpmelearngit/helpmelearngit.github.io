import { unifiedDiff, diffLines, splitLines } from './diff'
import { short } from './hash'
import {
  requireRepo, initRepo, headHash, headBranch, branches, tags, remoteBranches, resolve, isBranch, treeOf, writeBlob, createCommit,
  worktree, status, isClean, dirtyPaths, writeFile, removeFile, resetHard, switchTree, isAncestor, mergeBase, walk, commitsBetween,
  mergeTrees, treeFromFiles, diffStat, changedPaths, decorations, subject, setHead, logReflog, type TreeMap, materialize, ignorer,
} from './repo'
import { VFS } from './vfs'
import { World, type Repo, type OutLine, type Span, line, fail, fmtDate, GitError } from './world'
import { parseHubUrl, hubRepo, notify, runCI } from './hub'

export interface GitResult { lines: OutLine[]; editor?: { title: string; initial: string; onSave: (text: string) => OutLine[] } }

// ---------- arg parsing ----------
interface Args { flags: Set<string>; opts: Record<string, string>; pos: string[]; after: string[] }
function parse(argv: string[], valued: string[] = []): Args {
  const a: Args = { flags: new Set(), opts: {}, pos: [], after: [] }
  let i = 0
  for (; i < argv.length; i++) {
    const t = argv[i]
    if (t === '--') { a.after = argv.slice(i + 1); break }
    if (t.startsWith('--')) {
      const eq = t.indexOf('=')
      if (eq > 0) a.opts[t.slice(2, eq)] = t.slice(eq + 1)
      else if (valued.includes(t.slice(2))) a.opts[t.slice(2)] = argv[++i] ?? ''
      else a.flags.add(t.slice(2))
    } else if (/^-\d+$/.test(t)) a.opts.n = t.slice(1)
    else if (t.startsWith('-') && t.length > 1) {
      for (let k = 1; k < t.length; k++) {
        const c = t[k]
        if (valued.includes(c)) { a.opts[c] = k + 1 < t.length ? t.slice(k + 1) : (argv[++i] ?? ''); break }
        a.flags.add(c)
      }
    } else a.pos.push(t)
  }
  return a
}
const has = (a: Args, ...names: string[]) => names.some((n) => a.flags.has(n) || n in a.opts)
const opt = (a: Args, ...names: string[]) => { for (const n of names) if (n in a.opts) return a.opts[n]; return undefined }

// ---------- helpers ----------
const rel = (w: World, r: Repo, p: string) => {
  const abs = VFS.resolve(w.cwd, p)
  if (abs === r.root) return ''
  if (!abs.startsWith(r.root + '/')) fail(`fatal: ${p}: '${p}' is outside repository at '${r.root}'`)
  return abs.slice(r.root.length + 1)
}
/** Expand pathspecs (relative to cwd) to repo-relative file paths among `candidates`. */
function expandPaths(w: World, r: Repo, specs: string[], candidates: string[]): string[] {
  const out = new Set<string>()
  for (const s of specs) {
    const p = rel(w, r, s)
    const hits = candidates.filter((c) => p === '' || c === p || c.startsWith(p + '/'))
    if (!hits.length && !w.vfs.isDir(r.root + '/' + p)) fail(`fatal: pathspec '${s}' did not match any files`)
    hits.forEach((h) => out.add(h))
  }
  return [...out].sort()
}
const say = (out: OutLine[], t: string, c?: Span['c']) => t.split('\n').forEach((l) => out.push(line(l, c)))

function describeHead(r: Repo): string {
  const b = headBranch(r)
  return b ? `On branch ${b}` : `HEAD detached at ${short(headHash(r)!)}`
}
function aheadBehind(w: World, r: Repo): { up: string; ahead: number; behind: number } | null {
  const b = headBranch(r)
  if (!b || !r.upstream[b]) return null
  const upRef = r.refs['refs/remotes/' + r.upstream[b]]
  const h = headHash(r)
  if (!upRef || !h) return { up: r.upstream[b], ahead: 0, behind: 0 }
  return { up: r.upstream[b], ahead: commitsBetween(w, upRef, h).length, behind: commitsBetween(w, h, upRef).length }
}
function trackingLines(w: World, r: Repo, out: OutLine[]) {
  const ab = aheadBehind(w, r)
  if (!ab) return
  if (!ab.ahead && !ab.behind) say(out, `Your branch is up to date with '${ab.up}'.`)
  else if (ab.ahead && !ab.behind) say(out, `Your branch is ahead of '${ab.up}' by ${ab.ahead} commit${ab.ahead > 1 ? 's' : ''}.\n  (use "git push" to publish your local commits)`)
  else if (!ab.ahead && ab.behind) say(out, `Your branch is behind '${ab.up}' by ${ab.behind} commit${ab.behind > 1 ? 's' : ''}, and can be fast-forwarded.\n  (use "git pull" to update your local branch)`)
  else say(out, `Your branch and '${ab.up}' have diverged,\nand have ${ab.ahead} and ${ab.behind} different commits each, respectively.\n  (use "git pull" if you want to integrate the remote branch with yours)`)
}

function commitSummaryLines(w: World, r: Repo, hash: string, out: OutLine[]) {
  const c = w.commit(hash)
  const parent = c.parents[0] ? treeOf(w, c.parents[0]) : {}
  const b = headBranch(r)
  const where = b ? b : 'detached HEAD'
  say(out, `[${where}${c.parents.length ? '' : ' (root-commit)'} ${short(hash)}] ${subject(c.message)}`)
  const st = diffStat(w, parent, w.tree(c.tree))
  say(out, st.summary)
  for (const p of changedPaths(parent, w.tree(c.tree))) {
    if (!(p in parent)) say(out, ` create mode 100644 ${p}`)
    else if (!(p in w.tree(c.tree))) say(out, ` delete mode 100644 ${p}`)
  }
}

/** Apply a merge result to worktree + index, marking conflicts. */
function applyMerge(w: World, r: Repo, res: { files: Record<string, string>; conflicts: string[] }, oursTree: TreeMap, out: OutLine[]) {
  for (const p of Object.keys(r.index)) if (!(p in res.files)) { removeFile(w, r, p); delete r.index[p] }
  for (const [p, content] of Object.entries(res.files)) {
    writeFile(w, r, p, content)
    r.index[p] = res.conflicts.includes(p) && oursTree[p] ? oursTree[p] : writeBlob(w, content)
  }
  r.conflicts = new Set(res.conflicts)
  for (const p of res.conflicts) { say(out, `Auto-merging ${p}`); say(out, `CONFLICT (content): Merge conflict in ${p}`, 'err') }
}

// ---------- status ----------
function statusLines(w: World, r: Repo, shortFmt = false): OutLine[] {
  const out: OutLine[] = []
  const st = status(w, r)
  if (shortFmt) {
    for (const s of st.staged) out.push([{ t: s.kind === 'new file' ? 'A' : s.kind === 'deleted' ? 'D' : 'M', c: 'ok' }, { t: (st.unstaged.find((u) => u.path === s.path) ? 'M' : ' ') + ' ' + s.path }])
    for (const u of st.unstaged) if (!st.staged.find((s) => s.path === u.path)) out.push([{ t: ' ' }, { t: u.kind === 'deleted' ? 'D' : 'M', c: 'err' }, { t: ' ' + u.path }])
    for (const c of st.conflicts) out.push([{ t: 'UU', c: 'err' }, { t: ' ' + c }])
    for (const u of st.untracked) out.push([{ t: '??', c: 'err' }, { t: ' ' + u }])
    return out
  }
  say(out, describeHead(r))
  if (!headHash(r)) say(out, '\nNo commits yet')
  trackingLines(w, r, out)
  if (r.op?.kind === 'merge') say(out, st.conflicts.length ? 'You have unmerged paths.\n  (fix conflicts and run "git commit")\n  (use "git merge --abort" to abort the merge)' : 'All conflicts fixed but you are still merging.\n  (use "git commit" to conclude merge)')
  if (r.op?.kind === 'rebase') say(out, `rebase in progress; onto ${short(r.op.onto)}\nYou are currently rebasing${r.op.branch ? ` branch '${r.op.branch}'` : ''} on '${short(r.op.onto)}'.\n  (${st.conflicts.length ? 'fix conflicts and then run "git rebase --continue"' : 'all conflicts fixed: run "git rebase --continue"'})\n  (use "git rebase --skip" to skip this patch)\n  (use "git rebase --abort" to check out the original branch)`)
  if (r.op?.kind === 'cherry-pick') say(out, `You are currently cherry-picking commit ${short(r.op.hash)}.\n  (${st.conflicts.length ? 'fix conflicts and run "git cherry-pick --continue"' : 'all conflicts fixed: run "git cherry-pick --continue"'})\n  (use "git cherry-pick --abort" to cancel the cherry-pick operation)`)
  if (r.op?.kind === 'revert') say(out, `You are currently reverting commit ${short(r.op.hash)}.\n  (${st.conflicts.length ? 'fix conflicts and run "git revert --continue"' : 'all conflicts fixed: run "git revert --continue"'})\n  (use "git revert --abort" to cancel the revert operation)`)
  if (st.staged.length) {
    say(out, '\nChanges to be committed:\n  (use "git restore --staged <file>..." to unstage)')
    for (const s of st.staged) say(out, `\t${(s.kind + ':').padEnd(12)}${s.path}`, 'ok')
  }
  if (st.conflicts.length) {
    say(out, '\nUnmerged paths:\n  (use "git add <file>..." to mark resolution)')
    for (const c of st.conflicts) say(out, `\tboth modified:   ${c}`, 'err')
  }
  if (st.unstaged.length) {
    say(out, '\nChanges not staged for commit:\n  (use "git add <file>..." to update what will be committed)\n  (use "git restore <file>..." to discard changes in working directory)')
    for (const s of st.unstaged) say(out, `\t${(s.kind + ':').padEnd(12)}${s.path}`, 'err')
  }
  if (st.untracked.length) {
    say(out, '\nUntracked files:\n  (use "git add <file>..." to include in what will be committed)')
    for (const u of st.untracked) say(out, `\t${u}`, 'err')
  }
  if (isClean(st)) {
    if (st.untracked.length) say(out, '\nnothing added to commit but untracked files present (use "git add" to track)')
    else if (!r.op) say(out, '\nnothing to commit, working tree clean')
  } else if (!st.staged.length && !st.conflicts.length) say(out, '\nno changes added to commit (use "git add" and/or "git commit -a")')
  return out
}

// ---------- log ----------
function logEntry(w: World, r: Repo, h: string, oneline: boolean, prefix = ''): OutLine[] {
  const c = w.commit(h)
  const deco = decorations(r, h)
  const decoSpans: Span[] = []
  if (deco.length) {
    decoSpans.push({ t: ' (', c: 'warn' })
    deco.forEach((d, i) => { if (i) decoSpans.push({ t: ', ', c: 'warn' }); decoSpans.push({ t: d.text, c: d.c }) })
    decoSpans.push({ t: ')', c: 'warn' })
  }
  if (oneline) return [[{ t: prefix }, { t: short(h), c: 'hash' }, ...decoSpans, { t: ' ' + subject(c.message) }]]
  const out: OutLine[] = []
  out.push([{ t: prefix }, { t: 'commit ' + h, c: 'hash' }, ...decoSpans])
  const [name, email] = c.author.split(' <')
  if (c.parents.length > 1) out.push([{ t: prefix + 'Merge: ' + c.parents.map(short).join(' ') }])
  out.push([{ t: `${prefix}Author: ${name} <${email}` }])
  out.push([{ t: `${prefix}Date:   ${fmtDate(c.time)}` }])
  out.push([{ t: prefix }])
  for (const l of c.message.split('\n')) out.push([{ t: prefix + '    ' + l }])
  out.push([{ t: prefix }])
  return out
}

/** ponytail: ascii lanes only (no diagonal connectors). The SVG graph pane is the real visual. */
function asciiLanes(w: World, hashes: string[]): string[] {
  const lanes: (string | null)[] = []
  const rows: string[] = []
  for (const h of hashes) {
    let lane = lanes.indexOf(h)
    if (lane < 0) { lane = lanes.indexOf(null); if (lane < 0) { lanes.push(null); lane = lanes.length - 1 } }
    rows.push(lanes.map((l, i) => (i === lane ? '*' : l ? '|' : ' ')).join(' ').replace(/\s+$/, ''))
    const ps = w.commit(h).parents
    lanes[lane] = ps[0] ?? null
    for (const p of ps.slice(1)) if (!lanes.includes(p)) { const f = lanes.indexOf(null); if (f >= 0) lanes[f] = p; else lanes.push(p) }
    for (let i = 0; i < lanes.length; i++) for (let j = i + 1; j < lanes.length; j++) if (lanes[i] && lanes[i] === lanes[j]) lanes[j] = null
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop()
  }
  return rows
}

function logCmd(w: World, r: Repo, a: Args): OutLine[] {
  let starts: string[] = []
  const revs = a.pos.filter((p) => !p.includes('..'))
  const range = a.pos.find((p) => p.includes('..'))
  let hashes: string[]
  if (range) {
    const [x, y] = range.split('..')
    hashes = commitsBetween(w, resolve(w, r, x || 'HEAD'), resolve(w, r, y || 'HEAD')).reverse()
  } else {
    if (has(a, 'all')) starts = Object.values(r.refs).concat(headHash(r) ? [headHash(r)!] : [])
    else if (revs.length) starts = revs.map((v) => resolve(w, r, v))
    else { const h = headHash(r); if (!h) fail(`fatal: your current branch '${headBranch(r)}' does not have any commits yet`); starts = [h] }
    hashes = walk(w, starts)
  }
  const paths = a.after.map((p) => rel(w, r, p))
  if (paths.length) hashes = hashes.filter((h) => { const c = w.commit(h); const pt = treeOf(w, c.parents[0] ?? null); const t = w.tree(c.tree); return paths.some((p) => changedPaths(pt, t).some((cp) => cp === p || cp.startsWith(p + '/'))) })
  const grep = opt(a, 'grep'); if (grep) hashes = hashes.filter((h) => w.commit(h).message.toLowerCase().includes(grep.toLowerCase()))
  const author = opt(a, 'author'); if (author) hashes = hashes.filter((h) => w.commit(h).author.toLowerCase().includes(author.toLowerCase()))
  const pickaxe = opt(a, 'S'); if (pickaxe) hashes = hashes.filter((h) => { const c = w.commit(h); const cnt = (t: TreeMap) => Object.values(materialize(w, t)).join('\n').split(pickaxe).length; return cnt(treeOf(w, c.parents[0] ?? null)) !== cnt(w.tree(c.tree)) })
  const n = opt(a, 'n', 'max-count'); if (n) hashes = hashes.slice(0, +n)
  if (has(a, 'reverse')) hashes = hashes.reverse()
  const oneline = has(a, 'oneline')
  const out: OutLine[] = []
  const lanes = has(a, 'graph') ? asciiLanes(w, hashes) : null
  hashes.forEach((h, i) => {
    const prefix = lanes ? lanes[i].padEnd(Math.max(...lanes.map((l) => l.length))) + ' ' : ''
    out.push(...logEntry(w, r, h, oneline, prefix))
    if (has(a, 'stat') || has(a, 'p')) {
      const c = w.commit(h); const pt = treeOf(w, c.parents[0] ?? null)
      if (has(a, 'stat')) { const st = diffStat(w, pt, w.tree(c.tree)); say(out, st.lines.join('\n')); say(out, st.summary); say(out, '') }
      if (has(a, 'p')) out.push(...diffTrees(w, pt, w.tree(c.tree)))
    }
  })
  return out
}

function diffTrees(w: World, a: TreeMap, b: TreeMap, paths?: string[]): OutLine[] {
  const out: OutLine[] = []
  for (const p of changedPaths(a, b).sort()) {
    if (paths?.length && !paths.some((x) => p === x || p.startsWith(x + '/'))) continue
    for (const dl of unifiedDiff(p, a[p] ? w.blob(a[p]) : undefined, b[p] ? w.blob(b[p]) : undefined))
      out.push(line(dl.text, dl.kind === 'add' ? 'add' : dl.kind === 'del' ? 'del' : dl.kind === 'hunk' ? 'hunk' : dl.kind === 'meta' ? 'bold' : undefined))
  }
  return out
}
const worktreeTree = (w: World, r: Repo, onlyTracked = true): TreeMap => {
  const wt = worktree(w, r)
  const t: TreeMap = {}
  for (const [p, c] of Object.entries(wt)) if (!onlyTracked || p in r.index) t[p] = writeBlob(w, c)
  return t
}

// ---------- commit ----------
function doCommit(w: World, r: Repo, message: string, amend: boolean, allowEmpty = false): OutLine[] {
  const out: OutLine[] = []
  if (r.conflicts.size) fail(`error: Committing is not possible because you have unmerged files.\nhint: Fix them up in the work tree, and then use 'git add/rm <file>'\nhint: as appropriate to mark resolution and make a commit.\nfatal: Exiting because of an unresolved conflict.`)
  const head = headHash(r)
  const headTree = treeOf(w, head)
  message = message.split('\n').filter((l) => !l.startsWith('#')).join('\n').trim()
  if (!message) fail('Aborting commit due to empty commit message.')
  let parents = head ? [head] : []
  if (amend) { if (!head) fail('fatal: You have nothing to amend.'); parents = w.commit(head).parents }
  if (r.op?.kind === 'merge') parents = [head!, r.op.theirs]
  const same = JSON.stringify(Object.entries(r.index).sort()) === JSON.stringify(Object.entries(headTree).sort())
  if (same && !amend && !allowEmpty && r.op?.kind !== 'merge') {
    const st = statusLines(w, r)
    return st
  }
  const author = amend ? w.commit(head!).author : w.authorString()
  const time = w.now()
  const h = createCommit(w, { ...r.index }, parents, message, author, time)
  const what = r.op?.kind === 'merge' ? 'commit (merge)' : amend ? 'commit (amend)' : r.op?.kind === 'cherry-pick' ? 'cherry-pick' : r.op?.kind === 'revert' ? 'revert' : parents.length ? 'commit' : 'commit (initial)'
  if (r.op?.kind === 'rebase') { r.head = { detached: h }; logReflog(r, h, `rebase: ${subject(message)}`); r.op.current = undefined }
  else setHead(r, h, `${what}: ${subject(message)}`)
  if (r.op && r.op.kind !== 'rebase') r.op = undefined
  commitSummaryLines(w, r, h, out)
  return out
}

function commitCmd(w: World, r: Repo, a: Args): GitResult {
  if (has(a, 'a', 'all')) {
    const st = status(w, r)
    const wt = worktree(w, r)
    for (const u of st.unstaged) { if (u.kind === 'deleted') delete r.index[u.path]; else r.index[u.path] = writeBlob(w, wt[u.path]) }
  }
  const amend = has(a, 'amend')
  const msg = opt(a, 'm', 'message')
  if (msg !== undefined) return { lines: doCommit(w, r, msg, amend, has(a, 'allow-empty')) }
  if (amend && has(a, 'no-edit')) return { lines: doCommit(w, r, w.commit(headHash(r)!).message, true) }
  if (r.op?.kind === 'merge' && !r.conflicts.size) return { lines: doCommit(w, r, r.op.message, false) }
  if (r.op?.kind === 'cherry-pick') return { lines: doCommit(w, r, w.commit(r.op.hash).message, false) }
  if (r.op?.kind === 'revert') { const c = w.commit(r.op.hash); return { lines: doCommit(w, r, `Revert "${subject(c.message)}"\n\nThis reverts commit ${r.op.hash}.`, false) } }
  const st = status(w, r)
  if (!st.staged.length && !amend) return { lines: statusLines(w, r) }
  const st2 = statusLines(w, r).map((l) => l.map((s) => s.t).join('')).filter((t) => t.trim()).map((t) => '# ' + t).join('\n')
  const initial = (amend ? w.commit(headHash(r)!).message + '\n' : '') + `\n# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.\n#\n${st2}\n`
  return { lines: [], editor: { title: 'COMMIT_EDITMSG', initial, onSave: (text) => doCommit(w, r, text, amend) } }
}

// ---------- rebase machinery ----------
function replayOne(w: World, r: Repo, c: string, label: string, out: OutLine[]): 'ok' | 'conflict' | 'empty' {
  const commit = w.commit(c)
  const parentTree = treeOf(w, commit.parents[0] ?? null)
  const headTree = treeOf(w, headHash(r))
  const res = mergeTrees(w, parentTree, headTree, w.tree(commit.tree), 'HEAD', label)
  if (res.conflicts.length) { applyMerge(w, r, res, headTree, out); return 'conflict' }
  const newTree = treeFromFiles(w, res.files)
  if (JSON.stringify(Object.entries(newTree).sort()) === JSON.stringify(Object.entries(headTree).sort())) return 'empty'
  resetHard(w, r, newTree)
  const h = createCommit(w, newTree, headHash(r) ? [headHash(r)!] : [], commit.message, commit.author, w.now())
  return (setHead(r, h, `${label}: ${subject(commit.message)}`), 'ok')
}

function continueRebase(w: World, r: Repo, out: OutLine[]): OutLine[] {
  const op = r.op
  if (op?.kind !== 'rebase') fail('fatal: No rebase in progress?')
  while (op.todo.length) {
    const c = op.todo.shift()!
    op.current = c
    const res = replayOne(w, r, c, `${short(c)}... ${subject(w.commit(c).message)}`, out)
    if (res === 'conflict') {
      say(out, `error: could not apply ${short(c)}... ${subject(w.commit(c).message)}`, 'err')
      say(out, `hint: Resolve all conflicts manually, mark them as resolved with\nhint: "git add/rm <conflicted_files>", then run "git rebase --continue".\nhint: You can instead skip this commit: run "git rebase --skip".\nhint: To abort and get back to the state before "git rebase", run "git rebase --abort".`, 'warn')
      say(out, `Could not apply ${short(c)}... ${subject(w.commit(c).message)}`, 'err')
      return out
    }
    op.current = undefined
  }
  const tip = headHash(r)!
  if (op.branch) { r.refs['refs/heads/' + op.branch] = tip; r.head = { branch: op.branch } }
  r.op = undefined
  say(out, `Successfully rebased and updated refs/heads/${op.branch ?? 'HEAD'}.`)
  return out
}

function rebaseCmd(w: World, r: Repo, a: Args): OutLine[] {
  const out: OutLine[] = []
  if (has(a, 'abort')) {
    const op = r.op; if (op?.kind !== 'rebase') fail('fatal: No rebase in progress?')
    if (op.branch) { r.refs['refs/heads/' + op.branch] = op.origHead; r.head = { branch: op.branch } } else r.head = { detached: op.origHead }
    resetHard(w, r, treeOf(w, op.origHead)); r.op = undefined
    return out
  }
  if (has(a, 'continue')) {
    const op = r.op; if (op?.kind !== 'rebase') fail('fatal: No rebase in progress?')
    if (r.conflicts.size) fail(`error: could not apply ${short(op.current!)}... ${subject(w.commit(op.current!).message)}\nhint: Resolve all conflicts manually, mark them as resolved with\nhint: "git add/rm <conflicted_files>", then run "git rebase --continue".`)
    if (op.current) {
      const c = w.commit(op.current)
      const headTree = treeOf(w, headHash(r))
      if (JSON.stringify(Object.entries(r.index).sort()) !== JSON.stringify(Object.entries(headTree).sort())) {
        const h = createCommit(w, { ...r.index }, [headHash(r)!], c.message, c.author, w.now())
        r.head = { detached: h }; logReflog(r, h, `rebase (continue): ${subject(c.message)}`)
      }
      op.current = undefined
    }
    return continueRebase(w, r, out)
  }
  if (has(a, 'skip')) {
    const op = r.op; if (op?.kind !== 'rebase') fail('fatal: No rebase in progress?')
    resetHard(w, r, treeOf(w, headHash(r))); op.current = undefined
    return continueRebase(w, r, out)
  }
  if (r.op) fail(`fatal: It seems that there is already a ${r.op.kind} in progress.`)
  if (!a.pos[0]) fail('fatal: It is not possible to rebase without specifying an upstream branch.\nusage: git rebase <upstream> [<branch>]')
  const st = status(w, r)
  if (!isClean(st)) fail('error: cannot rebase: You have unstaged changes.\nerror: Please commit or stash them.')
  const upstream = resolve(w, r, a.pos[0])
  const onto = opt(a, 'onto') ? resolve(w, r, opt(a, 'onto')!) : upstream
  if (a.pos[1]) { const b = a.pos[1]; if (!isBranch(r, b)) fail(`fatal: no such branch/commit '${b}'`); switchTree(w, r, treeOf(w, headHash(r)), treeOf(w, r.refs['refs/heads/' + b])); r.head = { branch: b } }
  const head = headHash(r) ?? fail('fatal: no commits yet')
  const base = mergeBase(w, head, upstream)
  if (base === upstream && onto === upstream) { say(out, `Current branch ${headBranch(r) ?? 'HEAD'} is up to date.`); return out }
  const todo = commitsBetween(w, opt(a, 'onto') ? upstream : base, head).filter((h) => w.commit(h).parents.length <= 1)
  const branch = headBranch(r)
  r.op = { kind: 'rebase', onto, todo, origHead: head, branch }
  r.origHead = head
  r.head = { detached: onto }
  resetHard(w, r, treeOf(w, onto))
  logReflog(r, onto, `rebase (start): checkout ${a.pos[0]}`)
  return continueRebase(w, r, out)
}

// ---------- merge ----------
function mergeCmd(w: World, r: Repo, a: Args): OutLine[] {
  const out: OutLine[] = []
  if (has(a, 'abort')) {
    if (r.op?.kind !== 'merge') fail('fatal: There is no merge to abort (MERGE_HEAD missing).')
    resetHard(w, r, treeOf(w, r.origHead!)); r.op = undefined; return out
  }
  if (has(a, 'continue')) { if (r.op?.kind !== 'merge') fail('fatal: There is no merge in progress (MERGE_HEAD missing).'); return doCommit(w, r, r.op.message, false) }
  if (r.op) fail(`error: You have not concluded your ${r.op.kind} (${r.op.kind.toUpperCase()}_HEAD exists).\nhint: Please, commit your changes before you merge.\nfatal: Exiting because of unfinished ${r.op.kind}.`)
  const name = a.pos[0] ?? fail('fatal: No remote for the current branch.\nusage: git merge <branch>')
  const theirs = resolve(w, r, name)
  const head = headHash(r) ?? fail('fatal: no commits yet on current branch')
  const base = mergeBase(w, head, theirs)
  const headTree = treeOf(w, head), theirTree = treeOf(w, theirs)
  if (base === theirs) { say(out, 'Already up to date.'); return out }
  const dirty = dirtyPaths(status(w, r))
  const clobber = changedPaths(treeOf(w, base), theirTree).filter((p) => dirty.has(p))
  if (clobber.length) fail(`error: Your local changes to the following files would be overwritten by merge:\n${clobber.map((p) => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you merge.\nAborting`)
  const isRemote = name.includes('/') && ('refs/remotes/' + name) in r.refs
  const into = headBranch(r)
  const msg = opt(a, 'm') ?? (isRemote ? `Merge remote-tracking branch '${name}'` : isBranch(r, name) ? `Merge branch '${name}'${into && into !== 'main' ? ` into ${into}` : ''}` : `Merge commit '${short(theirs)}'`)
  if (base === head && !has(a, 'no-ff')) {
    switchTree(w, r, headTree, theirTree)
    setHead(r, theirs, `merge ${name}: Fast-forward`)
    say(out, `Updating ${short(head)}..${short(theirs)}\nFast-forward`)
    const st = diffStat(w, headTree, theirTree); say(out, st.lines.join('\n')); say(out, st.summary)
    return out
  }
  if (has(a, 'ff-only')) fail('fatal: Not possible to fast-forward, aborting.')
  const res = mergeTrees(w, treeOf(w, base), headTree, theirTree, 'HEAD', name)
  r.origHead = head
  applyMerge(w, r, res, headTree, out)
  if (res.conflicts.length) {
    r.op = { kind: 'merge', theirs, theirsName: name, message: msg }
    say(out, 'Automatic merge failed; fix conflicts and then commit the result.', 'err')
    return out
  }
  const h = createCommit(w, { ...r.index }, [head, theirs], msg)
  setHead(r, h, `merge ${name}: Merge made by the 'ort' strategy.`)
  say(out, "Merge made by the 'ort' strategy.")
  const st = diffStat(w, headTree, w.tree(w.commit(h).tree)); say(out, st.lines.join('\n')); say(out, st.summary)
  return out
}

// ---------- remotes ----------
function remoteUrl(r: Repo, name: string) { return r.remotes[name] ?? fail(`fatal: '${name}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`) }
function hubFor(w: World, url: string) {
  const key = parseHubUrl(url) ?? fail(`fatal: unable to access '${url}': Could not resolve host`)
  return hubRepo(w, key) ?? fail(`remote: Repository not found.\nfatal: repository '${url}' not found`)
}

function fetchCmd(w: World, r: Repo, a: Args, quiet = false): OutLine[] {
  const out: OutLine[] = []
  const name = a.pos[0] ?? (headBranch(r) && r.upstream[headBranch(r)!]?.split('/')[0]) ?? (r.remotes.origin ? 'origin' : fail('fatal: No remote repository specified.  Please, specify either a URL or a\nremote name from which new revisions should be fetched.'))
  const url = remoteUrl(r, name)
  const hub = hubFor(w, url)
  const only = a.pos[1]
  const lines: OutLine[] = []
  for (const b of branches(hub.repo)) {
    if (only && b !== only) continue
    const remote = hub.repo.refs['refs/heads/' + b]
    const local = r.refs[`refs/remotes/${name}/${b}`]
    if (local === remote) continue
    r.refs[`refs/remotes/${name}/${b}`] = remote
    if (!local) lines.push([{ t: ` * [new branch]      ${b.padEnd(10)} -> ${name}/${b}` }])
    else if (isAncestor(w, local, remote)) lines.push([{ t: `   ${short(local)}..${short(remote)}  ${b.padEnd(10)} -> ${name}/${b}` }])
    else lines.push([{ t: ` + ${short(local)}...${short(remote)} ${b.padEnd(10)} -> ${name}/${b}  (forced update)` }])
  }
  for (const t of tags(hub.repo)) if (!r.refs['refs/tags/' + t]) { r.refs['refs/tags/' + t] = hub.repo.refs['refs/tags/' + t]; lines.push([{ t: ` * [new tag]         ${t.padEnd(10)} -> ${t}` }]) }
  if (has(a, 'prune', 'p')) for (const rb of remoteBranches(r)) if (rb.startsWith(name + '/') && !isBranch(hub.repo, rb.slice(name.length + 1))) { delete r.refs['refs/remotes/' + rb]; lines.push([{ t: ` - [deleted]         (none)     -> ${rb}` }]) }
  if (lines.length && !quiet) { say(out, `From ${url.replace(/\.git$/, '')}`); out.push(...lines) }
  return out
}

function pushCmd(w: World, r: Repo, a: Args): OutLine[] {
  const out: OutLine[] = []
  const cur = headBranch(r)
  let name = a.pos[0]
  let specs = a.pos.slice(1)
  if (!name) {
    if (cur && r.upstream[cur]) name = r.upstream[cur].split('/')[0]
    else if (Object.keys(r.remotes).length === 1) name = Object.keys(r.remotes)[0]
    else if (r.remotes.origin) name = 'origin'
    else fail('fatal: No configured push destination.\nEither specify the URL from the command-line or configure a remote repository using\n\n    git remote add <name> <url>\n\nand then push using the remote name\n\n    git push <name>')
  }
  if (!specs.length) {
    if (!cur) fail('fatal: You are not currently on a branch.\nTo push the history leading to the current (detached HEAD)\nstate now, use\n\n    git push origin HEAD:<name-of-remote-branch>')
    if (r.upstream[cur]) { const [rn, rb] = [r.upstream[cur].split('/')[0], r.upstream[cur].split('/').slice(1).join('/')]; if (rn === name) specs = [`${cur}:${rb}`]; else specs = [cur] }
    else if (has(a, 'u', 'set-upstream') || has(a, 'all')) specs = has(a, 'all') ? branches(r) : [cur]
    else fail(`fatal: The current branch ${cur} has no upstream branch.\nTo push the current branch and set the remote as upstream, use\n\n    git push --set-upstream ${name} ${cur}\n\nTo have this happen automatically for branches without a tracking\nupstream, see 'push.autoSetupRemote' in 'git help config'.`)
  }
  if (has(a, 'tags')) specs.push(...tags(r))
  const url = remoteUrl(r, name!)
  const hub = hubFor(w, url)
  const results: OutLine[] = []
  let rejected = false, anything = false
  for (let spec of specs) {
    let del = has(a, 'delete', 'd')
    if (spec.startsWith(':')) { del = true; spec = spec.slice(1) + ':' + spec.slice(1) }
    const [srcRaw, dstRaw] = spec.includes(':') ? spec.split(':') : [spec, spec]
    const src = srcRaw === 'HEAD' ? cur ?? fail('fatal: HEAD is detached') : srcRaw
    const isTag = !isBranch(r, src) && ('refs/tags/' + src) in r.refs
    const dstRef = (isTag ? 'refs/tags/' : 'refs/heads/') + dstRaw
    const protectedBranch = hub.protection && hub.protection.branch === dstRaw && !isTag
    if (del) {
      if (!(dstRef in hub.repo.refs)) { results.push([{ t: `error: unable to delete '${dstRaw}': remote ref does not exist`, c: 'err' }]); rejected = true; continue }
      if (protectedBranch) { results.push([{ t: ` ! [remote rejected] ${dstRaw} (protected branch hook declined)`, c: 'err' }]); rejected = true; continue }
      delete hub.repo.refs[dstRef]; delete r.refs[`refs/remotes/${name}/${dstRaw}`]
      results.push([{ t: ` - [deleted]         ${dstRaw}` }]); anything = true; continue
    }
    const local = r.refs['refs/heads/' + src] ?? r.refs['refs/tags/' + src] ?? fail(`error: src refspec ${src} does not match any\nerror: failed to push some refs to '${url}'`)
    const remote = hub.repo.refs[dstRef]
    const tracking = r.refs[`refs/remotes/${name}/${dstRaw}`]
    if (remote === local) continue
    if (protectedBranch && (hub.protection!.requirePR || (hub.protection!.requireChecks && !runCI(w, hub, local).ok) || (remote && !isAncestor(w, remote, local)))) {
      results.push([{ t: ` ! [remote rejected] ${src} -> ${dstRaw} (protected branch hook declined)`, c: 'err' }])
      results.push([{ t: `remote: error: GH006: Protected branch update failed for refs/heads/${dstRaw}.`, c: 'err' }])
      results.push([{ t: `remote: error: ${hub.protection!.requirePR ? 'Changes must be made through a pull request.' : hub.protection!.requireChecks ? 'Required status check "ci" is expected.' : 'Cannot force-push to this branch.'}`, c: 'err' }])
      rejected = true; continue
    }
    if (remote && !isAncestor(w, remote, local)) {
      const lease = has(a, 'force-with-lease') && tracking === remote
      if (!(has(a, 'force', 'f') || lease)) {
        results.push([{ t: ` ! [rejected]        ${src} -> ${dstRaw} (${has(a, 'force-with-lease') ? 'stale info' : isTag ? 'already exists' : tracking && isAncestor(w, tracking, remote) && tracking !== remote ? 'fetch first' : 'non-fast-forward'})`, c: 'err' }])
        rejected = true; continue
      }
      results.push([{ t: ` + ${short(remote)}...${short(local)} ${src} -> ${dstRaw} (forced update)` }])
    } else if (!remote) results.push([{ t: ` * [new ${isTag ? 'tag' : 'branch'}]      ${src} -> ${dstRaw}` }])
    else results.push([{ t: `   ${short(remote)}..${short(local)}  ${src} -> ${dstRaw}` }])
    hub.repo.refs[dstRef] = local
    if (!isTag) r.refs[`refs/remotes/${name}/${dstRaw}`] = local
    anything = true
    if (!isTag && has(a, 'u', 'set-upstream')) { r.upstream[src] = `${name}/${dstRaw}`; results.push([{ t: `branch '${src}' set up to track '${name}/${dstRaw}'.` }]) }
    notify(w, `${w.user.handle} pushed to ${dstRaw} in ${hub.owner}/${hub.name}`, `${hub.owner}/${hub.name}`)
  }
  if (!results.length) { say(out, 'Everything up-to-date'); return out }
  if (anything || rejected) say(out, `To ${url}`)
  out.push(...results)
  if (rejected) {
    say(out, `error: failed to push some refs to '${url}'`, 'err')
    if (results.some((l) => l[0].t.includes('non-fast-forward') || l[0].t.includes('fetch first')))
      say(out, `hint: Updates were rejected because the remote contains work that you do not\nhint: have locally. This is usually caused by another repository pushing to\nhint: the same ref. If you want to integrate the remote changes, use\nhint: 'git pull' before pushing again.\nhint: See the 'Note about fast-forwards' in 'git push --help' for details.`, 'warn')
    if (results.some((l) => l[0].t.includes('stale info')))
      say(out, `hint: Your remote-tracking branch is behind the remote. Run 'git fetch' to see what\nhint: changed, then decide whether forcing is still safe.`, 'warn')
  }
  return out
}

function pullCmd(w: World, r: Repo, a: Args): OutLine[] {
  const out: OutLine[] = []
  const cur = headBranch(r) ?? fail('fatal: You are not currently on a branch.')
  const name = a.pos[0] ?? r.upstream[cur]?.split('/')[0] ?? (r.remotes.origin ? 'origin' : fail('fatal: No remote repository specified.'))
  const branch = a.pos[1] ?? (r.upstream[cur] ? r.upstream[cur].split('/').slice(1).join('/') : null)
  if (!branch) fail(`There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n\nIf you wish to set tracking information for this branch you can do so with:\n\n    git branch --set-upstream-to=${name}/<branch> ${cur}`)
  out.push(...fetchCmd(w, r, { ...a, pos: [name, branch!] }))
  const target = r.refs[`refs/remotes/${name}/${branch}`] ?? fail(`fatal: couldn't find remote ref ${branch}`)
  const head = headHash(r)
  if (!head) { resetHard(w, r, treeOf(w, target)); r.refs['refs/heads/' + cur] = target; if (!r.upstream[cur]) r.upstream[cur] = `${name}/${branch}`; return out }
  const base = mergeBase(w, head, target)
  if (base === target) { say(out, 'Already up to date.'); return out }
  const rebase = has(a, 'rebase', 'r') || (w.config['pull.rebase'] ?? r.config['pull.rebase']) === 'true'
  if (base === head && !rebase) { out.push(...mergeCmd(w, r, { ...a, pos: [`${name}/${branch}`] })); return out }
  if (rebase) { out.push(...rebaseCmd(w, r, { flags: new Set(), opts: {}, pos: [`${name}/${branch}`], after: [] })); return out }
  if (!has(a, 'no-rebase', 'ff') && (w.config['pull.rebase'] ?? r.config['pull.rebase']) === undefined)
    fail(`hint: You have divergent branches and need to specify how to reconcile them.\nhint: You can do so by running one of the following commands sometime before\nhint: your next pull:\nhint:\nhint:   git config pull.rebase false  # merge\nhint:   git config pull.rebase true   # rebase\nhint:   git config pull.ff only       # fast-forward only\nhint:\nhint: You can replace "git config" with "git config --global" to set a default\nhint: preference for all repositories. You can also pass --rebase, --no-rebase,\nhint: or --ff-only on the command line to override the configured default per\nhint: invocation.\nfatal: Need to specify how to reconcile divergent branches.`)
  out.push(...mergeCmd(w, r, { ...a, pos: [`${name}/${branch}`] }))
  return out
}

function cloneCmd(w: World, a: Args): OutLine[] {
  const out: OutLine[] = []
  const url = a.pos[0] ?? fail('fatal: You must specify a repository to clone.')
  const hub = hubFor(w, url)
  const dir = VFS.resolve(w.cwd, a.pos[1] ?? hub.name)
  if (w.vfs.isDir(dir) && w.vfs.list(dir).length) fail(`fatal: destination path '${VFS.basename(dir)}' already exists and is not an empty directory.`)
  say(out, `Cloning into '${VFS.basename(dir)}'...`)
  const r = initRepo(w, dir)
  r.remotes.origin = url
  for (const b of branches(hub.repo)) r.refs['refs/remotes/origin/' + b] = hub.repo.refs['refs/heads/' + b]
  for (const t of tags(hub.repo)) r.refs['refs/tags/' + t] = hub.repo.refs['refs/tags/' + t]
  const def = hub.defaultBranch
  const tip = hub.repo.refs['refs/heads/' + def]
  r.head = { branch: def }
  if (!tip) { say(out, 'warning: You appear to have cloned an empty repository.', 'warn'); return out }
  r.refs['refs/heads/' + def] = tip
  r.upstream[def] = 'origin/' + def
  resetHard(w, r, treeOf(w, tip))
  logReflog(r, tip, `clone: from ${url}`)
  const n = walk(w, [tip]).length
  say(out, `remote: Enumerating objects: ${n * 3}, done.\nremote: Total ${n * 3} (delta ${n}), reused ${n * 3} (delta ${n}), pack-reused 0\nReceiving objects: 100% (${n * 3}/${n * 3}), done.\nResolving deltas: 100% (${n}/${n}), done.`)
  return out
}

// ---------- the rest ----------
function switchTo(w: World, r: Repo, name: string, out: OutLine[]) {
  const target = r.refs['refs/heads/' + name] ?? fail(`fatal: invalid reference: ${name}`)
  const cur = headBranch(r)
  if (cur === name) { say(out, `Already on '${name}'`); trackingLines(w, r, out); return }
  switchTree(w, r, treeOf(w, headHash(r)), treeOf(w, target))
  if (cur) r.prevBranch = cur
  r.head = { branch: name }
  logReflog(r, target, `checkout: moving from ${cur ?? short(headHash(r) ?? '')} to ${name}`)
  say(out, `Switched to branch '${name}'`)
  trackingLines(w, r, out)
}
function createBranch(w: World, r: Repo, name: string, start?: string) {
  if (isBranch(r, name)) fail(`fatal: a branch named '${name}' already exists`)
  if (!/^[\w\-./]+$/.test(name) || name.endsWith('.lock') || name.includes('..')) fail(`fatal: '${name}' is not a valid branch name`)
  const h = start ? resolve(w, r, start) : headHash(r)
  if (!h) fail(`fatal: not a valid object name: '${start ?? 'main'}'`)
  r.refs['refs/heads/' + name] = h
  if (start && ('refs/remotes/' + start) in r.refs) r.upstream[name] = start
}
function detach(w: World, r: Repo, h: string, label: string, out: OutLine[]) {
  switchTree(w, r, treeOf(w, headHash(r)), treeOf(w, h))
  const from = headBranch(r) ?? short(headHash(r) ?? '')
  if (headBranch(r)) r.prevBranch = headBranch(r)!
  r.head = { detached: h }
  logReflog(r, h, `checkout: moving from ${from} to ${label}`)
  say(out, `Note: switching to '${label}'.\n\nYou are in 'detached HEAD' state. You can look around, make experimental\nchanges and commit them, and you can discard any commits you make in this\nstate without impacting any branches by switching back to a branch.\n\nIf you want to create a new branch to retain commits you create, you may\ndo so (now or later) by using -c with the switch command. Example:\n\n  git switch -c <new-branch-name>\n\nHEAD is now at ${short(h)} ${subject(w.commit(h).message)}`, 'dim')
}

function restorePaths(w: World, r: Repo, specs: string[], staged: boolean, wt: boolean, source?: string) {
  const srcTree = source ? treeOf(w, resolve(w, r, source)) : treeOf(w, headHash(r))
  const candidates = [...new Set([...Object.keys(r.index), ...Object.keys(srcTree), ...Object.keys(worktree(w, r))])]
  const paths = expandPaths(w, r, specs, candidates)
  if (!paths.length) fail(`error: pathspec '${specs[0]}' did not match any file(s) known to git`)
  for (const p of paths) {
    if (!(p in r.index) && !(p in srcTree)) { if (specs.length === 1 && candidates.length) fail(`error: pathspec '${specs[0]}' did not match any file(s) known to git`); continue }
    if (staged) { if (srcTree[p]) r.index[p] = srcTree[p]; else delete r.index[p]; r.conflicts.delete(p) }
    if (wt) { const h = source ? srcTree[p] : r.index[p]; if (h) writeFile(w, r, p, w.blob(h)); else removeFile(w, r, p) }
  }
}

function blameCmd(w: World, r: Repo, a: Args): OutLine[] {
  const p = rel(w, r, a.pos[0] ?? fail('usage: git blame <file>'))
  const head = headHash(r) ?? fail('fatal: no commits yet')
  const content = w.vfs.files.get(r.root + '/' + p) ?? fail(`fatal: no such path '${p}' in HEAD`)
  const lines = splitLines(content)
  const owner: (string | null)[] = lines.map(() => null)
  let map = lines.map((_, i) => i) // current line -> index in file at `cur`
  let cur: string | null = head
  // uncommitted lines
  { const hl = treeOf(w, head)[p]; const ops = diffLines(hl ? w.blob(hl) : '', content); let ci = 0, hi = 0; const m: number[] = []; for (const o of ops) { if (o.t === 'add') { owner[ci] = '0000000'; m[ci] = -1; ci++ } else if (o.t === 'eq') { m[ci] = hi; ci++; hi++ } else hi++ } map = map.map((_, i) => m[i]) }
  while (cur) {
    const c: ReturnType<typeof w.commit> = w.commit(cur)
    const parent = c.parents[0] ?? null
    const here = w.tree(c.tree)[p], there = parent ? treeOf(w, parent)[p] : undefined
    const ops = diffLines(there ? w.blob(there) : '', here ? w.blob(here) : '')
    const toParent: number[] = []
    let hi = 0, pi = 0
    for (const o of ops) { if (o.t === 'add') toParent[hi++] = -1; else if (o.t === 'eq') toParent[hi++] = pi++; else pi++ }
    for (let i = 0; i < lines.length; i++) { if (owner[i] || map[i] < 0) continue; const np = toParent[map[i]]; if (np === -1 || np === undefined) { owner[i] = cur; map[i] = -1 } else map[i] = np }
    cur = parent
  }
  const out: OutLine[] = []
  lines.forEach((l, i) => {
    const h = owner[i] ?? head
    if (h === '0000000') out.push([{ t: `00000000 (Not Committed Yet ${fmtDate(w.clock).slice(0, 24)} ${String(i + 1).padStart(2)}) ${l}` }])
    else { const c = w.commit(h); out.push([{ t: short(h) + ' ', c: 'hash' }, { t: `(${c.author.split(' <')[0].padEnd(12)} ${new Date(c.time * 1000).toISOString().slice(0, 19).replace('T', ' ')} ${String(i + 1).padStart(2)}) ${l}` }]) }
  })
  return out
}

function stashCmd(w: World, r: Repo, a: Args): OutLine[] {
  const out: OutLine[] = []
  const sub = a.pos[0] && ['push', 'pop', 'list', 'drop', 'apply', 'clear', 'show'].includes(a.pos[0]) ? a.pos.shift()! : 'push'
  const head = headHash(r)
  if (sub === 'list') { r.stash.forEach((h, i) => out.push([{ t: `stash@{${i}}: ${w.commit(h).message}` }])); return out }
  if (sub === 'clear') { r.stash = []; return out }
  if (sub === 'push') {
    if (!head) fail('fatal: You do not have the initial commit yet')
    const st = status(w, r)
    const wt = worktree(w, r)
    if (isClean(st) && !(has(a, 'u', 'include-untracked') && st.untracked.length)) { say(out, 'No local changes to save'); return out }
    const files: Record<string, string> = {}
    for (const p of Object.keys(r.index)) if (p in wt) files[p] = wt[p]
    if (has(a, 'u', 'include-untracked')) for (const u of st.untracked) files[u] = wt[u]
    const label = `${headBranch(r) ?? '(no branch)'}: ${short(head)} ${subject(w.commit(head).message)}`
    const msg = opt(a, 'm', 'message') ? `On ${label.split(':')[0]}: ${opt(a, 'm', 'message')}` : `WIP on ${label}`
    const h = createCommit(w, treeFromFiles(w, files), [head], msg)
    r.stash.unshift(h)
    resetHard(w, r, treeOf(w, head))
    if (has(a, 'u', 'include-untracked')) for (const u of st.untracked) removeFile(w, r, u)
    say(out, `Saved working directory and index state ${msg}`)
    return out
  }
  const idx = a.pos[0] ? +(a.pos[0].match(/\{(\d+)\}/)?.[1] ?? a.pos[0]) : 0
  const sh = r.stash[idx] ?? fail(a.pos[0] ? `fatal: Log for 'stash' only has ${r.stash.length} entries` : 'No stash entries found.')
  if (sub === 'drop') { r.stash.splice(idx, 1); say(out, `Dropped refs/stash@{${idx}} (${sh})`); return out }
  if (sub === 'show') { const c = w.commit(sh); const st = diffStat(w, treeOf(w, c.parents[0]), w.tree(c.tree)); say(out, st.lines.join('\n')); say(out, st.summary); return out }
  const c = w.commit(sh)
  const res = mergeTrees(w, treeOf(w, c.parents[0]), worktreeTree(w, r, false), w.tree(c.tree), 'Updated upstream', 'Stashed changes')
  const before = { ...r.index }
  for (const [p, content] of Object.entries(res.files)) { writeFile(w, r, p, content); if (!(p in r.index)) r.index[p] = writeBlob(w, content) }
  for (const p of Object.keys(before)) if (!(p in res.files) && p in w.tree(c.tree) === false && p in treeOf(w, c.parents[0]) && !(p in res.files)) removeFile(w, r, p)
  if (res.conflicts.length) { r.conflicts = new Set(res.conflicts); for (const p of res.conflicts) say(out, `CONFLICT (content): Merge conflict in ${p}`, 'err'); say(out, 'The stash entry is kept in case you need it again.'); return out }
  out.push(...statusLines(w, r))
  if (sub === 'pop') { r.stash.splice(idx, 1); say(out, `Dropped refs/stash@{${idx}} (${sh})`) }
  return out
}

function configCmd(w: World, a: Args): OutLine[] {
  const out: OutLine[] = []
  const r = (() => { try { return requireRepo(w) } catch { return null } })()
  const store = has(a, 'global') || !r ? w.config : r.config
  if (has(a, 'list', 'l')) {
    say(out, `user.name=${w.user.name}\nuser.email=${w.user.email}`)
    for (const [k, v] of Object.entries({ ...w.config, ...(r?.config ?? {}) })) say(out, `${k}=${v}`)
    if (r) for (const [n, u] of Object.entries(r.remotes)) say(out, `remote.${n}.url=${u}\nremote.${n}.fetch=+refs/heads/*:refs/remotes/${n}/*`)
    return out
  }
  const [key, ...rest] = a.pos
  if (!key) fail('usage: git config [<options>] <key> [<value>]')
  if (has(a, 'unset')) { delete store[key]; return out }
  const value = rest.join(' ')
  if (!rest.length) {
    const v = key === 'user.name' ? w.user.name : key === 'user.email' ? w.user.email : (r?.config[key] ?? w.config[key])
    if (v === undefined) fail('')
    say(out, v); return out
  }
  if (key === 'user.name') w.user.name = value
  else if (key === 'user.email') w.user.email = value
  else store[key] = value
  return out
}

// ---------- dispatcher ----------
export function git(w: World, argv: string[]): GitResult {
  const out: OutLine[] = []
  let [cmd, ...rest] = argv
  if (!cmd || cmd === 'help' || cmd === '--help') return { lines: HELP.map((l) => line(l)) }
  if (cmd === '--version' || cmd === '-v') return { lines: [line('git version 2.47.0 (simulated)')] }
  const alias = w.config['alias.' + cmd] ?? (() => { try { return requireRepo(w).config['alias.' + cmd] } catch { return undefined } })()
  if (alias) { const parts = alias.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((s) => s.replace(/^"|"$/g, '')) ?? []; cmd = parts[0]; rest = [...parts.slice(1), ...rest] }

  if (cmd === 'init') {
    const a = parse(rest)
    const dir = VFS.resolve(w.cwd, a.pos[0] ?? '.')
    if (w.repos.has(dir)) return { lines: [line(`Reinitialized existing Git repository in ${dir}/.git/`)] }
    initRepo(w, dir)
    say(out, `Initialized empty Git repository in ${dir}/.git/`)
    return { lines: out }
  }
  if (cmd === 'clone') return { lines: cloneCmd(w, parse(rest)) }
  if (cmd === 'config') return { lines: configCmd(w, parse(rest)) }

  const r = requireRepo(w)
  const head = headHash(r)
  const headTree = treeOf(w, head)

  switch (cmd) {
    case 'status': { const a = parse(rest); return { lines: statusLines(w, r, has(a, 's', 'short')) } }
    case 'add': {
      const a = parse(rest)
      const wt = worktree(w, r)
      const specs = has(a, 'A', 'all') ? ['.'] : [...a.pos, ...a.after]
      if (!specs.length) fail("Nothing specified, nothing added.\nhint: Maybe you wanted to say 'git add .'?")
      const isIg = ignorer(w, r)
      const candidates = [...new Set([...Object.keys(wt), ...Object.keys(r.index)])]
      const paths = expandPaths(w, r, specs, candidates)
      const skipped: string[] = []
      for (const p of paths) {
        if (p in wt) {
          if (!(p in r.index) && isIg(p)) { if (specs.some((s) => rel(w, r, s) === p)) skipped.push(p); continue }
          r.index[p] = writeBlob(w, wt[p])
        } else delete r.index[p]
        r.conflicts.delete(p)
      }
      if (skipped.length) say(out, `The following paths are ignored by one of your .gitignore files:\n${skipped.join('\n')}\nhint: Use -f if you really want to add them.`, 'warn')
      return { lines: out }
    }
    case 'rm': {
      const a = parse(rest)
      const paths = expandPaths(w, r, [...a.pos, ...a.after], Object.keys(r.index))
      if (!paths.length) fail(`fatal: pathspec '${a.pos[0]}' did not match any files`)
      for (const p of paths) {
        if (!has(a, 'cached', 'f', 'force') && headTree[p] && r.index[p] !== headTree[p]) fail(`error: the following file has staged content different from both the\nfile and the HEAD:\n    ${p}\n(use -f to force removal)`)
        delete r.index[p]
        if (!has(a, 'cached')) removeFile(w, r, p)
        say(out, `rm '${p}'`)
      }
      return { lines: out }
    }
    case 'mv': {
      const a = parse(rest)
      const [from, to] = a.pos
      const fp = rel(w, r, from), tp = rel(w, r, to)
      if (!(fp in r.index)) fail(`fatal: not under version control, source=${fp}, destination=${tp}`)
      w.vfs.mv(r.root + '/' + fp, r.root + '/' + tp)
      r.index[tp] = r.index[fp]; delete r.index[fp]
      return { lines: out }
    }
    case 'commit': return commitCmd(w, r, parse(rest, ['m', 'message']))
    case 'log': return { lines: logCmd(w, r, parse(rest, ['n', 'max-count', 'S'])) }
    case 'show': {
      const a = parse(rest)
      const spec = a.pos[0] ?? 'HEAD'
      if (spec.includes(':')) { const [rv, p] = spec.split(':'); const t = treeOf(w, resolve(w, r, rv)); const h = t[rel(w, r, p)] ?? fail(`fatal: path '${p}' does not exist in '${rv}'`); say(out, w.blob(h)); return { lines: out } }
      const h = resolve(w, r, spec)
      out.push(...logEntry(w, r, h, false))
      const c = w.commit(h)
      if (has(a, 'stat')) { const st = diffStat(w, treeOf(w, c.parents[0] ?? null), w.tree(c.tree)); say(out, st.lines.join('\n')); say(out, st.summary) }
      else if (c.parents.length <= 1) out.push(...diffTrees(w, treeOf(w, c.parents[0] ?? null), w.tree(c.tree)))
      return { lines: out }
    }
    case 'diff': {
      const a = parse(rest)
      const paths = a.after.map((p) => rel(w, r, p))
      const wtT = worktreeTree(w, r)
      if (has(a, 'staged', 'cached')) return { lines: diffTrees(w, headTree, r.index, paths) }
      if (a.pos.length === 0) return { lines: diffTrees(w, r.index, wtT, paths) }
      if (a.pos[0].includes('..')) { const [x, y] = a.pos[0].split('..'); return { lines: diffTrees(w, treeOf(w, resolve(w, r, x || 'HEAD')), treeOf(w, resolve(w, r, y || 'HEAD')), paths) } }
      if (a.pos.length === 1) return { lines: diffTrees(w, treeOf(w, resolve(w, r, a.pos[0])), wtT, paths) }
      return { lines: diffTrees(w, treeOf(w, resolve(w, r, a.pos[0])), treeOf(w, resolve(w, r, a.pos[1])), paths) }
    }
    case 'branch': {
      const a = parse(rest, ['u', 'set-upstream-to'])
      if (has(a, 'd', 'D', 'delete')) {
        for (const name of a.pos) {
          if (!isBranch(r, name)) fail(`error: branch '${name}' not found.`)
          if (headBranch(r) === name) fail(`error: Cannot delete branch '${name}' checked out at '${r.root}'`)
          const h = r.refs['refs/heads/' + name]
          const up = r.upstream[name] && r.refs['refs/remotes/' + r.upstream[name]]
          if (!has(a, 'D') && !(head && isAncestor(w, h, head)) && !(up && isAncestor(w, h, up))) fail(`error: The branch '${name}' is not fully merged.\nIf you are sure you want to delete it, run 'git branch -D ${name}'.`)
          delete r.refs['refs/heads/' + name]; delete r.upstream[name]
          say(out, `Deleted branch ${name} (was ${short(h)}).`)
        }
        return { lines: out }
      }
      if (has(a, 'm', 'M', 'move')) {
        const [oldN, newN] = a.pos.length === 2 ? a.pos : [headBranch(r)!, a.pos[0]]
        if (!isBranch(r, oldN)) fail(`error: refname refs/heads/${oldN} not found`)
        if (isBranch(r, newN)) fail(`fatal: a branch named '${newN}' already exists`)
        r.refs['refs/heads/' + newN] = r.refs['refs/heads/' + oldN]; delete r.refs['refs/heads/' + oldN]
        if (r.upstream[oldN]) { r.upstream[newN] = r.upstream[oldN]; delete r.upstream[oldN] }
        if (headBranch(r) === oldN) r.head = { branch: newN }
        return { lines: out }
      }
      const up = opt(a, 'u', 'set-upstream-to')
      if (up) {
        const b = a.pos[0] ?? headBranch(r) ?? fail('fatal: HEAD is detached')
        if (!(('refs/remotes/' + up) in r.refs)) fail(`error: the requested upstream branch '${up}' does not exist\nhint: If you are planning on basing your work on an upstream branch that already exists at the remote, you may need to run "git fetch" to retrieve it.`)
        r.upstream[b] = up; say(out, `branch '${b}' set up to track '${up}'.`); return { lines: out }
      }
      if (has(a, 'unset-upstream')) { delete r.upstream[a.pos[0] ?? headBranch(r)!]; return { lines: out } }
      if (a.pos.length) { createBranch(w, r, a.pos[0], a.pos[1]); return { lines: out } }
      const cur = headBranch(r)
      if ('detached' in r.head) out.push([{ t: `* (HEAD detached at ${short(r.head.detached)})`, c: 'ok' }])
      const list = has(a, 'r', 'remotes') ? [] : branches(r)
      for (const b of list) {
        const spans: Span[] = [{ t: (b === cur ? '* ' : '  ') }, { t: b, c: b === cur ? 'ok' : undefined }]
        if (has(a, 'v', 'vv')) { const h = r.refs['refs/heads/' + b]; spans.push({ t: ' ' + short(h) + ' ', c: 'hash' }); if (r.upstream[b] && has(a, 'vv')) spans.push({ t: `[${r.upstream[b]}] `, c: 'remote' }); spans.push({ t: subject(w.commit(h).message) }) }
        out.push(spans)
      }
      if (has(a, 'a', 'all', 'r', 'remotes')) for (const rb of remoteBranches(r)) out.push([{ t: '  remotes/' + rb, c: 'remote' }])
      return { lines: out }
    }
    case 'switch': {
      const a = parse(rest, ['c', 'C', 'create'])
      const c = opt(a, 'c', 'C', 'create')
      if (c) { if (!head) { r.head = { branch: c }; say(out, `Switched to a new branch '${c}'`); return { lines: out } } createBranch(w, r, c, a.pos[0]); switchTo(w, r, c, []); say(out, `Switched to a new branch '${c}'`); return { lines: out } }
      if (has(a, 'detach')) { const h = resolve(w, r, a.pos[0] ?? 'HEAD'); detach(w, r, h, a.pos[0] ?? 'HEAD', out); return { lines: out } }
      const name = a.pos[0] === '-' ? (r.prevBranch ?? fail('fatal: no previous branch')) : (a.pos[0] ?? fail('fatal: missing branch or commit argument'))
      if (!isBranch(r, name)) {
        if (('refs/remotes/origin/' + name) in r.refs) { createBranch(w, r, name, 'origin/' + name); switchTo(w, r, name, []); say(out, `branch '${name}' set up to track 'origin/${name}'.\nSwitched to a new branch '${name}'`); return { lines: out } }
        fail(`fatal: invalid reference: ${name}`)
      }
      switchTo(w, r, name, out)
      return { lines: out }
    }
    case 'checkout': {
      const a = parse(rest, ['b', 'B'])
      const b = opt(a, 'b', 'B')
      if (b) { if (!head) { r.head = { branch: b }; say(out, `Switched to a new branch '${b}'`); return { lines: out } } createBranch(w, r, b, a.pos[0]); switchTo(w, r, b, []); say(out, `Switched to a new branch '${b}'`); return { lines: out } }
      if (a.after.length) { restorePaths(w, r, a.after, false, true); return { lines: out } }
      const name = a.pos[0] === '-' ? (r.prevBranch ?? fail('fatal: no previous branch')) : (a.pos[0] ?? fail('fatal: missing branch or commit argument'))
      if (isBranch(r, name)) { switchTo(w, r, name, out); return { lines: out } }
      if (('refs/remotes/origin/' + name) in r.refs) { createBranch(w, r, name, 'origin/' + name); switchTo(w, r, name, []); say(out, `branch '${name}' set up to track 'origin/${name}'.\nSwitched to a new branch '${name}'`); return { lines: out } }
      const asPath = (() => { try { return rel(w, r, name) } catch { return null } })()
      if (asPath !== null && (asPath in r.index || w.vfs.isDir(r.root + '/' + asPath))) { restorePaths(w, r, a.pos, false, true); return { lines: out } }
      const h = resolve(w, r, name)
      detach(w, r, h, name, out)
      return { lines: out }
    }
    case 'merge': return { lines: mergeCmd(w, r, parse(rest, ['m'])) }
    case 'rebase': return { lines: rebaseCmd(w, r, parse(rest, ['onto'])) }
    case 'reset': {
      const a = parse(rest)
      const looksRev = (s: string) => { try { resolve(w, r, s); return !(rel(w, r, s) in r.index) } catch { return false } }
      const pathSpecs = a.after.length ? a.after : a.pos.filter((p) => !looksRev(p))
      const revArg = a.pos.find((p) => looksRev(p))
      if (pathSpecs.length) {
        const srcTree = treeOf(w, revArg ? resolve(w, r, revArg) : head)
        const paths = expandPaths(w, r, pathSpecs, [...new Set([...Object.keys(r.index), ...Object.keys(srcTree)])])
        for (const p of paths) { if (srcTree[p]) r.index[p] = srcTree[p]; else delete r.index[p]; r.conflicts.delete(p) }
        const st = status(w, r)
        if (st.unstaged.length) { say(out, 'Unstaged changes after reset:'); for (const u of st.unstaged) say(out, `${u.kind === 'deleted' ? 'D' : 'M'}\t${u.path}`) }
        return { lines: out }
      }
      const target = resolve(w, r, revArg ?? 'HEAD')
      r.origHead = head ?? undefined
      const mode = has(a, 'hard') ? 'hard' : has(a, 'soft') ? 'soft' : 'mixed'
      if (mode === 'hard') { resetHard(w, r, treeOf(w, target)); r.op = undefined }
      else if (mode === 'mixed') { r.index = { ...treeOf(w, target) }; r.conflicts.clear() }
      setHead(r, target, `reset: moving to ${revArg ?? 'HEAD'}`)
      if (mode === 'hard') say(out, `HEAD is now at ${short(target)} ${subject(w.commit(target).message)}`)
      else if (mode === 'mixed') { const st = status(w, r); if (st.unstaged.length) { say(out, 'Unstaged changes after reset:'); for (const u of st.unstaged) say(out, `${u.kind === 'deleted' ? 'D' : 'M'}\t${u.path}`) } }
      return { lines: out }
    }
    case 'restore': {
      const a = parse(rest, ['source', 's'])
      const specs = [...a.pos, ...a.after]
      if (!specs.length) fail('fatal: you must specify path(s) to restore')
      const staged = has(a, 'staged', 'S'), wt = has(a, 'worktree', 'W') || !staged
      restorePaths(w, r, specs, staged, wt, opt(a, 'source', 's'))
      return { lines: out }
    }
    case 'revert': {
      const a = parse(rest)
      if (has(a, 'abort')) { if (r.op?.kind !== 'revert') fail('error: no revert in progress'); resetHard(w, r, headTree); r.op = undefined; return { lines: out } }
      if (has(a, 'continue')) { if (r.op?.kind !== 'revert') fail('error: no revert in progress'); return commitCmd(w, r, parse([])) }
      if (r.op) fail(`error: a ${r.op.kind} is already in progress`)
      if (!head) fail('fatal: bad revision')
      if (!isClean(status(w, r))) fail('error: your local changes would be overwritten by revert.\nhint: commit your changes or stash them to proceed.\nfatal: revert failed')
      const h = resolve(w, r, a.pos[0] ?? fail('usage: git revert <commit>'))
      const c = w.commit(h)
      if (c.parents.length > 1) fail(`error: commit ${short(h)} is a merge but no -m option was given.\nfatal: revert failed`)
      const res = mergeTrees(w, w.tree(c.tree), headTree, treeOf(w, c.parents[0] ?? null), 'HEAD', `parent of ${short(h)}... ${subject(c.message)}`)
      applyMerge(w, r, res, headTree, out)
      r.op = { kind: 'revert', hash: h }
      if (res.conflicts.length) { say(out, `error: could not revert ${short(h)}... ${subject(c.message)}\nhint: After resolving the conflicts, mark them with\nhint: "git add/rm <pathspec>", then run\nhint: "git revert --continue".\nhint: To abort and get back to the state before "git revert",\nhint: run "git revert --abort".`, 'err'); return { lines: out } }
      return { lines: doCommit(w, r, `Revert "${subject(c.message)}"\n\nThis reverts commit ${h}.`, false) }
    }
    case 'cherry-pick': {
      const a = parse(rest)
      if (has(a, 'abort')) { if (r.op?.kind !== 'cherry-pick') fail('error: no cherry-pick in progress'); resetHard(w, r, headTree); r.op = undefined; return { lines: out } }
      if (has(a, 'continue')) { if (r.op?.kind !== 'cherry-pick') fail('error: no cherry-pick in progress'); return commitCmd(w, r, parse([])) }
      if (r.op) fail(`error: a ${r.op.kind} is already in progress`)
      if (!isClean(status(w, r))) fail('error: your local changes would be overwritten by cherry-pick.\nhint: commit your changes or stash them to proceed.\nfatal: cherry-pick failed')
      for (const spec of a.pos) {
        const h = resolve(w, r, spec)
        const c = w.commit(h)
        const label = `${short(h)}... ${subject(c.message)}`
        const res = replayOne(w, r, h, label, out)
        if (res === 'conflict') { r.op = { kind: 'cherry-pick', hash: h }; say(out, `error: could not apply ${label}\nhint: After resolving the conflicts, mark them with\nhint: "git add/rm <pathspec>", then run\nhint: "git cherry-pick --continue".\nhint: To abort and get back to the state before "git cherry-pick",\nhint: run "git cherry-pick --abort".`, 'err'); return { lines: out } }
        if (res === 'empty') { say(out, `The previous cherry-pick is now empty, possibly due to conflict resolution.\nnothing to commit, working tree clean`); continue }
        commitSummaryLines(w, r, headHash(r)!, out)
      }
      return { lines: out }
    }
    case 'stash': return { lines: stashCmd(w, r, parse(rest, ['m', 'message'])) }
    case 'tag': {
      const a = parse(rest, ['m', 'message'])
      if (has(a, 'd', 'delete')) { for (const t of a.pos) { const h = r.refs['refs/tags/' + t] ?? fail(`error: tag '${t}' not found.`); delete r.refs['refs/tags/' + t]; say(out, `Deleted tag '${t}' (was ${short(h)})`) } return { lines: out } }
      if (!a.pos.length || has(a, 'l', 'list')) { for (const t of tags(r)) say(out, t); return { lines: out } }
      const [name, start] = a.pos
      if (('refs/tags/' + name) in r.refs) fail(`fatal: tag '${name}' already exists`)
      if (!/^[\w\-.]+$/.test(name)) fail(`fatal: '${name}' is not a valid tag name.`)
      r.refs['refs/tags/' + name] = start ? resolve(w, r, start) : head ?? fail('fatal: Failed to resolve \'HEAD\' as a valid ref.')
      return { lines: out }
    }
    case 'remote': {
      const a = parse(rest)
      const [sub, ...args] = a.pos
      if (!sub) { for (const n of Object.keys(r.remotes).sort()) say(out, has(a, 'v', 'verbose') ? `${n}\t${r.remotes[n]} (fetch)\n${n}\t${r.remotes[n]} (push)` : n); return { lines: out } }
      if (sub === 'add') { const [n, u] = args; if (!n || !u) fail('usage: git remote add <name> <url>'); if (r.remotes[n]) fail(`error: remote ${n} already exists.`); if (!parseHubUrl(u)) fail(`fatal: '${u}' is not a valid repository URL for this simulator (expected https://github.com/<owner>/<repo>.git)`); r.remotes[n] = u; return { lines: out } }
      if (sub === 'remove' || sub === 'rm') { const [n] = args; if (!r.remotes[n]) fail(`error: No such remote: '${n}'`); delete r.remotes[n]; for (const k of Object.keys(r.refs)) if (k.startsWith(`refs/remotes/${n}/`)) delete r.refs[k]; for (const b of Object.keys(r.upstream)) if (r.upstream[b].startsWith(n + '/')) delete r.upstream[b]; return { lines: out } }
      if (sub === 'rename') { const [o, n] = args; if (!r.remotes[o]) fail(`error: No such remote: '${o}'`); r.remotes[n] = r.remotes[o]; delete r.remotes[o]; for (const k of Object.keys(r.refs)) if (k.startsWith(`refs/remotes/${o}/`)) { r.refs[k.replace(`refs/remotes/${o}/`, `refs/remotes/${n}/`)] = r.refs[k]; delete r.refs[k] } for (const b of Object.keys(r.upstream)) if (r.upstream[b].startsWith(o + '/')) r.upstream[b] = n + r.upstream[b].slice(o.length); return { lines: out } }
      if (sub === 'get-url') { say(out, remoteUrl(r, args[0])); return { lines: out } }
      if (sub === 'set-url') { if (!r.remotes[args[0]]) fail(`error: No such remote '${args[0]}'`); r.remotes[args[0]] = args[1]; return { lines: out } }
      if (sub === 'show') { const n = args[0] ?? fail('usage: git remote show <name>'); const u = remoteUrl(r, n); const hub = hubFor(w, u); say(out, `* remote ${n}\n  Fetch URL: ${u}\n  Push  URL: ${u}\n  HEAD branch: ${hub.defaultBranch}\n  Remote branches:`); for (const b of branches(hub.repo)) say(out, `    ${b.padEnd(12)} ${r.refs[`refs/remotes/${n}/${b}`] ? 'tracked' : 'new (next fetch will store in remotes/' + n + ')'}`); return { lines: out } }
      fail(`error: Unknown subcommand: ${sub}`)
      break
    }
    case 'fetch': return { lines: fetchCmd(w, r, parse(rest)) }
    case 'push': return { lines: pushCmd(w, r, parse(rest)) }
    case 'pull': return { lines: pullCmd(w, r, parse(rest)) }
    case 'reflog': { r.reflog.forEach((e, i) => { const d = decorations(r, e.hash); const spans: Span[] = [{ t: short(e.hash), c: 'hash' }]; if (d.length) spans.push({ t: ' (', c: 'warn' }, ...d.flatMap((x, k): Span[] => [...(k ? [{ t: ', ', c: 'warn' as const }] : []), { t: x.text, c: x.c }]), { t: ')', c: 'warn' }); spans.push({ t: ` HEAD@{${i}}: ${e.msg}` }); out.push(spans) }); return { lines: out } }
    case 'blame': return { lines: blameCmd(w, r, parse(rest)) }
    case 'ls-files': { for (const p of Object.keys(r.index).sort()) say(out, p); return { lines: out } }
    case 'rev-parse': { const a = parse(rest); if (has(a, 'abbrev-ref')) { say(out, headBranch(r) ?? 'HEAD'); return { lines: out } } say(out, resolve(w, r, a.pos[0] ?? 'HEAD')); return { lines: out } }
    case 'merge-base': { const a = parse(rest); const b = mergeBase(w, resolve(w, r, a.pos[0]), resolve(w, r, a.pos[1])); say(out, b ?? ''); return { lines: out } }
    case 'clean': { const a = parse(rest); const st = status(w, r); if (!has(a, 'f', 'force')) fail('fatal: clean.requireForce is true and -f not given: refusing to clean'); for (const u of st.untracked) { if (has(a, 'n', 'dry-run')) say(out, `Would remove ${u}`); else { removeFile(w, r, u); say(out, `Removing ${u}`) } } return { lines: out } }
    default:
      fail(`git: '${cmd}' is not a git command. See 'git help'.`)
  }
  return { lines: out }
}

export const isGitError = (e: unknown): e is GitError => e instanceof GitError

const HELP = [
  'usage: git <command> [<args>]',
  '',
  'Commands this simulator understands:',
  '   start a working area:   init, clone',
  '   work on current change: add, rm, mv, restore, reset, stash, clean',
  '   examine history:        status, log, show, diff, blame, reflog',
  '   grow and tweak history: branch, switch, checkout, commit, merge, rebase, revert, cherry-pick, tag',
  '   collaborate:            remote, fetch, pull, push',
  '   configuration:          config',
  '',
  'Try "git <command> --help" in a real terminal for the full manual.',
]
