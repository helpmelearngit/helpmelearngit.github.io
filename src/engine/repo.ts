import { merge3, diffLines } from './diff'
import { VFS } from './vfs'
import { World, type Repo, type Commit, fail, newRepo } from './world'

export type TreeMap = Record<string, string> // path -> blob hash

// ---------- locating ----------
export function repoAt(w: World, path: string): Repo | null {
  let p = path
  for (;;) {
    const r = w.repos.get(p)
    if (r) return r
    if (p === '/') return null
    p = VFS.parent(p)
  }
}
export const requireRepo = (w: World, path = w.cwd): Repo =>
  repoAt(w, path) ?? fail('fatal: not a git repository (or any of the parent directories): .git')

export function initRepo(w: World, root: string): Repo {
  if (w.repos.has(root)) fail(`Reinitialized existing Git repository in ${root}/.git/`)
  w.vfs.mkdirp(root)
  w.vfs.mkdirp(root + '/.git')
  const r = newRepo(root)
  w.repos.set(root, r)
  return r
}

// ---------- refs & HEAD ----------
export const headHash = (r: Repo): string | null =>
  'detached' in r.head ? r.head.detached : (r.refs['refs/heads/' + r.head.branch] ?? null)
export const headBranch = (r: Repo): string | null => ('branch' in r.head ? r.head.branch : null)
export const branches = (r: Repo) => Object.keys(r.refs).filter((k) => k.startsWith('refs/heads/')).map((k) => k.slice(11)).sort()
export const tags = (r: Repo) => Object.keys(r.refs).filter((k) => k.startsWith('refs/tags/')).map((k) => k.slice(10)).sort()
export const remoteBranches = (r: Repo) => Object.keys(r.refs).filter((k) => k.startsWith('refs/remotes/')).map((k) => k.slice(13)).sort()

export function logReflog(r: Repo, hash: string | null, msg: string) {
  if (hash) r.reflog.unshift({ hash, msg })
}

/** Move HEAD (and the branch it points to) to a commit. */
export function setHead(r: Repo, hash: string, msg: string) {
  if ('branch' in r.head) r.refs['refs/heads/' + r.head.branch] = hash
  else r.head = { detached: hash }
  logReflog(r, hash, msg)
}

/** Resolve a revision expression to a commit hash. */
export function resolve(w: World, r: Repo, rev: string): string {
  const m = rev.match(/^(.*?)((?:[~^]\d*)+)$/)
  if (m && m[1] !== '') {
    let h = resolve(w, r, m[1])
    for (const step of m[2].match(/[~^]\d*/g)!) {
      const n = step.length > 1 ? parseInt(step.slice(1)) : 1
      if (step[0] === '~') for (let i = 0; i < n; i++) h = w.commit(h).parents[0] ?? fail(`fatal: ambiguous argument '${rev}': unknown revision`)
      else h = w.commit(h).parents[n - 1] ?? fail(`fatal: ambiguous argument '${rev}': unknown revision`)
    }
    return h
  }
  if (rev === 'HEAD' || rev === '@') return headHash(r) ?? fail("fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.")
  const rl = rev.match(/^HEAD@\{(\d+)\}$/)
  if (rl) return r.reflog[+rl[1]]?.hash ?? fail(`fatal: log for 'HEAD' only has ${r.reflog.length} entries`)
  const st = rev.match(/^stash@\{(\d+)\}$/)
  if (st) return r.stash[+st[1]] ?? fail(`fatal: log for 'refs/stash' only has ${r.stash.length} entries`)
  if (rev === 'ORIG_HEAD' && r.origHead) return r.origHead
  for (const p of ['refs/heads/', 'refs/tags/', 'refs/remotes/', 'refs/']) if (r.refs[p + rev]) return r.refs[p + rev]
  if (/^[0-9a-f]{4,40}$/.test(rev)) {
    const h = w.findByPrefix(rev)
    if (h) return h
  }
  return fail(`fatal: ambiguous argument '${rev}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`)
}

export const isBranch = (r: Repo, name: string) => 'refs/heads/' + name in r.refs

// ---------- trees ----------
export const treeOf = (w: World, commit: string | null): TreeMap => (commit ? w.tree(w.commit(commit).tree) : {})
export const writeBlob = (w: World, content: string) => w.put({ type: 'blob', content })
export const writeTree = (w: World, entries: TreeMap) => w.put({ type: 'tree', entries })
export function writeCommit(w: World, c: Omit<Commit, 'type'>): string { return w.put({ type: 'commit', ...c }) }

export function createCommit(w: World, tree: TreeMap, parents: string[], message: string, author = w.authorString(), time = w.now()): string {
  return writeCommit(w, { tree: writeTree(w, tree), parents, message, author, time })
}

/** Files of a tree as path->content. */
export const materialize = (w: World, t: TreeMap): Record<string, string> => Object.fromEntries(Object.entries(t).map(([p, h]) => [p, w.blob(h)]))

// ---------- worktree ----------
const globToRe = (g: string) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\0').replace(/\*/g, '[^/]*').replace(/\0/g, '.*').replace(/\?/g, '.') + '$')
export function ignorer(w: World, r: Repo): (rel: string) => boolean {
  const src = w.vfs.files.get(r.root + '/.gitignore') ?? ''
  const pats = src.split('\n').map((s) => s.trim()).filter((s) => s && !s.startsWith('#'))
  const rules = pats.map((p) => {
    const core = p.replace(/^!/, '').replace(/\/$/, '')
    return { neg: p.startsWith('!'), dirOnly: p.endsWith('/'), re: globToRe(core.replace(/^\//, '')), anchored: core.includes('/') }
  })
  return (rel) => {
    let ig = false
    const segs = rel.split('/')
    for (const rule of rules) {
      let hit = false
      if (rule.anchored) hit = rule.re.test(rel) || segs.some((_, i) => rule.re.test(segs.slice(0, i + 1).join('/')) && (i < segs.length - 1 || !rule.dirOnly))
      else hit = segs.some((s, i) => rule.re.test(s) && (i < segs.length - 1 || !rule.dirOnly))
      if (hit) ig = !rule.neg
    }
    return ig
  }
}

/** All files in the worktree, relative path -> content. */
export function worktree(w: World, r: Repo): Record<string, string> {
  const out: Record<string, string> = {}
  const pre = r.root + '/'
  for (const f of w.vfs.filesUnder(r.root)) out[f.slice(pre.length)] = w.vfs.files.get(f)!
  return out
}

export interface Status {
  staged: { path: string; kind: 'new file' | 'modified' | 'deleted' | 'renamed' }[]
  unstaged: { path: string; kind: 'modified' | 'deleted' }[]
  untracked: string[]
  conflicts: string[]
}
export function status(w: World, r: Repo): Status {
  const head = treeOf(w, headHash(r))
  const wt = worktree(w, r)
  const ignored = ignorer(w, r)
  const s: Status = { staged: [], unstaged: [], untracked: [], conflicts: [...r.conflicts].sort() }
  for (const p of [...new Set([...Object.keys(head), ...Object.keys(r.index)])].sort()) {
    if (r.conflicts.has(p)) continue
    if (!(p in head)) s.staged.push({ path: p, kind: 'new file' })
    else if (!(p in r.index)) s.staged.push({ path: p, kind: 'deleted' })
    else if (head[p] !== r.index[p]) s.staged.push({ path: p, kind: 'modified' })
  }
  for (const p of Object.keys(r.index).sort()) {
    if (r.conflicts.has(p)) continue
    if (!(p in wt)) s.unstaged.push({ path: p, kind: 'deleted' })
    else if (writeBlob(w, wt[p]) !== r.index[p]) s.unstaged.push({ path: p, kind: 'modified' })
  }
  for (const p of Object.keys(wt).sort()) if (!(p in r.index) && !ignored(p)) s.untracked.push(p)
  return s
}
export const isClean = (st: Status) => !st.staged.length && !st.unstaged.length && !st.conflicts.length
export const dirtyPaths = (st: Status) => new Set([...st.staged.map((x) => x.path), ...st.unstaged.map((x) => x.path), ...st.conflicts])

export function writeFile(w: World, r: Repo, rel: string, content: string) { w.vfs.write(r.root + '/' + rel, content) }
export function removeFile(w: World, r: Repo, rel: string) { if (w.vfs.isFile(r.root + '/' + rel)) w.vfs.rm(r.root + '/' + rel) }

/** Force worktree + index to match a tree (untracked files kept). */
export function resetHard(w: World, r: Repo, tree: TreeMap) {
  for (const p of Object.keys(r.index)) if (!(p in tree)) removeFile(w, r, p)
  for (const [p, h] of Object.entries(tree)) writeFile(w, r, p, w.blob(h))
  r.index = { ...tree }
  r.conflicts.clear()
}

/** Switch worktree from one tree to another while keeping local changes. Throws if changes would be clobbered. */
export function switchTree(w: World, r: Repo, from: TreeMap, to: TreeMap) {
  const st = status(w, r)
  const dirty = dirtyPaths(st)
  const wt = worktree(w, r)
  const clobber: string[] = [], untrackedClobber: string[] = []
  for (const p of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (from[p] === to[p]) continue
    if (dirty.has(p)) clobber.push(p)
    else if (!(p in r.index) && p in wt && to[p] && writeBlob(w, wt[p]) !== to[p]) untrackedClobber.push(p)
  }
  if (clobber.length) fail(`error: Your local changes to the following files would be overwritten by checkout:\n${clobber.map((p) => '\t' + p).join('\n')}\nPlease commit your changes or stash them before you switch branches.\nAborting`)
  if (untrackedClobber.length) fail(`error: The following untracked working tree files would be overwritten by checkout:\n${untrackedClobber.map((p) => '\t' + p).join('\n')}\nPlease move or remove them before you switch branches.\nAborting`)
  for (const p of new Set([...Object.keys(from), ...Object.keys(to)])) {
    if (from[p] === to[p]) continue
    if (to[p] === undefined) { removeFile(w, r, p); delete r.index[p] }
    else { writeFile(w, r, p, w.blob(to[p])); r.index[p] = to[p] }
  }
}

// ---------- history ----------
export function ancestors(w: World, start: string[]): Set<string> {
  const seen = new Set<string>()
  const stack = [...start]
  while (stack.length) {
    const h = stack.pop()!
    if (seen.has(h)) continue
    seen.add(h)
    stack.push(...w.commit(h).parents)
  }
  return seen
}
export const isAncestor = (w: World, a: string, b: string) => ancestors(w, [b]).has(a)

export function mergeBase(w: World, a: string, b: string): string | null {
  const A = ancestors(w, [a])
  const q = [b]; const seen = new Set<string>()
  while (q.length) {
    const h = q.shift()!
    if (seen.has(h)) continue
    seen.add(h)
    if (A.has(h)) return h
    q.push(...w.commit(h).parents)
  }
  return null
}

/** Commits reachable from `starts`, newest first (clock is monotonic so time order is topological). */
export function walk(w: World, starts: string[], limit = Infinity, stopAt?: Set<string>): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  const frontier = [...new Set(starts)]
  while (frontier.length && out.length < limit) {
    frontier.sort((x, y) => w.commit(y).time - w.commit(x).time)
    const h = frontier.shift()!
    if (seen.has(h) || stopAt?.has(h)) continue
    seen.add(h)
    out.push(h)
    for (const p of w.commit(h).parents) if (!seen.has(p)) frontier.push(p)
  }
  return out
}

/** Linear list of commits on `tip` not reachable from `base`, oldest first. */
export function commitsBetween(w: World, base: string | null, tip: string): string[] {
  const stop = base ? ancestors(w, [base]) : new Set<string>()
  return walk(w, [tip], Infinity, stop).reverse()
}

// ---------- merging ----------
export interface TreeMergeResult { files: Record<string, string>; conflicts: string[] }
export function mergeTrees(w: World, base: TreeMap, ours: TreeMap, theirs: TreeMap, oursLabel: string, theirsLabel: string): TreeMergeResult {
  const files: Record<string, string> = {}
  const conflicts: string[] = []
  for (const p of new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)])) {
    const b = base[p], o = ours[p], t = theirs[p]
    let pick: string | undefined
    if (o === t) pick = o
    else if (b === o) pick = t
    else if (b === t) pick = o
    else if (o && t) {
      const m = merge3(b ? w.blob(b) : '', w.blob(o), w.blob(t), oursLabel, theirsLabel)
      if (m.conflict) conflicts.push(p)
      files[p] = m.content
      continue
    } else { conflicts.push(p); files[p] = w.blob((o ?? t)!); continue }
    if (pick !== undefined) files[p] = w.blob(pick)
  }
  return { files, conflicts }
}

export const treeFromFiles = (w: World, files: Record<string, string>): TreeMap =>
  Object.fromEntries(Object.entries(files).map(([p, c]) => [p, writeBlob(w, c)]))

/** Stat summary like " 2 files changed, 3 insertions(+), 1 deletion(-)" plus per-file lines. */
export function diffStat(w: World, a: TreeMap, b: TreeMap): { lines: string[]; summary: string; changed: number } {
  const lines: string[] = []
  let files = 0, ins = 0, del = 0
  const paths = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
  for (const p of paths) {
    if (a[p] === b[p]) continue
    files++
    const ops = diffLines(a[p] ? w.blob(a[p]) : '', b[p] ? w.blob(b[p]) : '')
    const i = ops.filter((o) => o.t === 'add').length, d = ops.filter((o) => o.t === 'del').length
    ins += i; del += d
    lines.push(` ${p.padEnd(Math.min(30, Math.max(...paths.map((x) => x.length))))} | ${String(i + d).padStart(2)} ${'+'.repeat(Math.min(i, 30))}${'-'.repeat(Math.min(d, 30))}`)
  }
  const parts = [`${files} file${files === 1 ? '' : 's'} changed`]
  if (ins) parts.push(`${ins} insertion${ins === 1 ? '' : 's'}(+)`)
  if (del) parts.push(`${del} deletion${del === 1 ? '' : 's'}(-)`)
  return { lines, summary: ' ' + parts.join(', '), changed: files }
}

export const changedPaths = (a: TreeMap, b: TreeMap) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((p) => a[p] !== b[p])

/** Decorations for a commit hash: ["HEAD -> main", "origin/main", "tag: v1"] */
export function decorations(r: Repo, h: string): { text: string; c: 'head' | 'branch' | 'remote' | 'tag' }[] {
  const out: { text: string; c: 'head' | 'branch' | 'remote' | 'tag' }[] = []
  const hh = headHash(r)
  if (hh === h) {
    if ('branch' in r.head) out.push({ text: `HEAD -> ${r.head.branch}`, c: 'head' })
    else out.push({ text: 'HEAD', c: 'head' })
  }
  for (const [ref, v] of Object.entries(r.refs).sort()) {
    if (v !== h) continue
    if (ref.startsWith('refs/heads/')) { if (!('branch' in r.head && r.head.branch === ref.slice(11))) out.push({ text: ref.slice(11), c: 'branch' }) }
    else if (ref.startsWith('refs/remotes/')) out.push({ text: ref.slice(13), c: 'remote' })
    else if (ref.startsWith('refs/tags/')) out.push({ text: 'tag: ' + ref.slice(10), c: 'tag' })
  }
  return out
}

export const subject = (msg: string) => msg.split('\n')[0]
