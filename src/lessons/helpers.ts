/**
 * Helpers for writing lesson `setup` and `check` functions.
 * Everything here is safe to call from checks: predicates return false instead of throwing.
 */
import { exec } from '../engine/shell'
import { HOME, VFS } from '../engine/vfs'
import { World, type Repo, type HubRepo } from '../engine/world'
import { repoAt, headHash, headBranch, treeOf, createCommit, writeBlob, resetHard, status, isClean, walk, isAncestor as isAnc, mergeBase, materialize, type TreeMap, branches as branchList } from '../engine/repo'
import { createHubRepo as _createHubRepo, hubCommit as _hubCommit, forkRepo as _forkRepo, openPR as _openPR, createIssue as _createIssue, reviewPR as _reviewPR, commentPR as _commentPR, hubKey, runCI } from '../engine/hub'
import { initRepo } from '../engine/repo'

export { HOME }
export const abs = (p: string) => (p.startsWith('/') ? p : p === '~' ? HOME : p.startsWith('~/') ? HOME + p.slice(1) : HOME + '/' + p)

/** Run shell commands silently during setup. */
export const sh = (w: World, ...cmds: string[]) => { for (const c of cmds) exec(w, c) }

export interface SeedCommit { msg: string; files: Record<string, string | null>; author?: string }

/**
 * Create a repo at `path` (relative to home) with linear history. Each commit applies `files` on top of the previous tree
 * (null deletes). Leaves the worktree clean on `branch` (default main).
 */
export function seedRepo(w: World, path: string, commits: SeedCommit[], opts: { branch?: string; remote?: string } = {}): Repo {
  const root = abs(path)
  const r = w.repos.get(root) ?? initRepo(w, root)
  const branch = opts.branch ?? 'main'
  r.head = { branch }
  let parent: string | null = r.refs['refs/heads/' + branch] ?? null
  let tree: TreeMap = { ...treeOf(w, parent) }
  for (const c of commits) {
    for (const [p, content] of Object.entries(c.files)) { if (content === null) delete tree[p]; else tree[p] = writeBlob(w, content) }
    parent = createCommit(w, tree, parent ? [parent] : [], c.msg, c.author ?? w.authorString())
    r.refs['refs/heads/' + branch] = parent
    r.reflog.unshift({ hash: parent, msg: `commit: ${c.msg.split('\n')[0]}` })
  }
  if (parent) resetHard(w, r, treeOf(w, parent))
  if (opts.remote) r.remotes.origin = opts.remote
  w.cwd = root
  return r
}

/** Add commits on a (new or existing) branch starting from `from` (branch name or hash). Does not switch to it. */
export function seedBranch(w: World, path: string, name: string, from: string, commits: SeedCommit[]) {
  const r = w.repos.get(abs(path)) ?? seedRepo(w, path, [])
  let parent: string | null = r.refs['refs/heads/' + name] ?? r.refs['refs/heads/' + from] ?? (w.objects.has(from) ? from : null)
  let tree: TreeMap = { ...treeOf(w, parent) }
  for (const c of commits) {
    for (const [p, content] of Object.entries(c.files)) { if (content === null) delete tree[p]; else tree[p] = writeBlob(w, content) }
    parent = createCommit(w, tree, parent ? [parent] : [], c.msg, c.author ?? w.authorString())
  }
  if (parent) r.refs['refs/heads/' + name] = parent
}

/** Write (or overwrite) files in the worktree without committing. */
export function writeFiles(w: World, path: string, files: Record<string, string>) {
  for (const [p, c] of Object.entries(files)) w.vfs.write(abs(path) + '/' + p, c)
}

// ---------- hub seeding ----------
export const createHubRepo = _createHubRepo
export const hubCommit = _hubCommit
export const forkRepo = _forkRepo
export const openPR = _openPR
export const createIssue = _createIssue
export const reviewPR = _reviewPR
export const commentPR = _commentPR
export const hubUrl = (key: string) => `https://github.com/${key}.git`

// ---------- predicates (never throw) ----------
const safe = <T,>(fn: () => T, fallback: T): T => { try { return fn() } catch { return fallback } }

export const repo = (w: World, path?: string): Repo | null => (path ? w.repos.get(abs(path)) ?? null : repoAt(w, w.cwd))
export const head = (w: World, path?: string): string | null => safe(() => { const r = repo(w, path); return r ? headHash(r) : null }, null)
export const branch = (w: World, path?: string): string | null => safe(() => { const r = repo(w, path); return r ? headBranch(r) : null }, null)
export const branches = (w: World, path?: string): string[] => safe(() => { const r = repo(w, path); return r ? branchList(r) : [] }, [])
export const branchHash = (w: World, name: string, path?: string): string | null => safe(() => repo(w, path)?.refs['refs/heads/' + name] ?? null, null)
export const branchExists = (w: World, name: string, path?: string) => branchHash(w, name, path) !== null
export const tagExists = (w: World, name: string, path?: string) => safe(() => !!repo(w, path)?.refs['refs/tags/' + name], false)
export const remoteExists = (w: World, name: string, path?: string) => safe(() => !!repo(w, path)?.remotes[name], false)
export const upstreamOf = (w: World, name: string, path?: string): string | null => safe(() => repo(w, path)?.upstream[name] ?? null, null)
export const remoteRef = (w: World, ref: string, path?: string): string | null => safe(() => repo(w, path)?.refs['refs/remotes/' + ref] ?? null, null)
export const isDetached = (w: World, path?: string) => safe(() => { const r = repo(w, path); return !!r && 'detached' in r.head }, false)

/** Commit messages reachable from `ref` (default HEAD), newest first. */
export const log = (w: World, ref = 'HEAD', path?: string): string[] => safe(() => {
  const r = repo(w, path); if (!r) return []
  const start = ref === 'HEAD' ? headHash(r) : r.refs['refs/heads/' + ref] ?? r.refs['refs/tags/' + ref] ?? r.refs['refs/remotes/' + ref] ?? ref
  return start ? walk(w, [start]).map((h) => w.commit(h).message) : []
}, [])
export const commitCount = (w: World, ref = 'HEAD', path?: string) => log(w, ref, path).length
export const lastMessage = (w: World, path?: string) => log(w, 'HEAD', path)[0] ?? ''
export const hasCommit = (w: World, re: RegExp | string, ref = 'HEAD', path?: string) => log(w, ref, path).some((m) => (typeof re === 'string' ? m.includes(re) : re.test(m)))
export const headParents = (w: World, path?: string): string[] => safe(() => { const h = head(w, path); return h ? w.commit(h).parents : [] }, [])
export const isMergeCommit = (w: World, path?: string) => headParents(w, path).length > 1
export const isAncestor = (w: World, a: string, b: string) => safe(() => isAnc(w, a, b), false)
export const mergeBaseOf = (w: World, a: string, b: string) => safe(() => mergeBase(w, a, b), null)

/** Files at a commit (ref resolved like `log`). */
export const filesAt = (w: World, ref = 'HEAD', path?: string): Record<string, string> => safe(() => {
  const r = repo(w, path); if (!r) return {}
  const start = ref === 'HEAD' ? headHash(r) : r.refs['refs/heads/' + ref] ?? r.refs['refs/tags/' + ref] ?? r.refs['refs/remotes/' + ref] ?? ref
  return start ? materialize(w, treeOf(w, start)) : {}
}, {})
export const committedFile = (w: World, file: string, ref = 'HEAD', path?: string): string | null => filesAt(w, ref, path)[file] ?? null

/** Worktree file content, or null. `p` is relative to home unless absolute. */
export const file = (w: World, p: string): string | null => w.vfs.files.get(abs(p)) ?? null
export const fileExists = (w: World, p: string) => w.vfs.isFile(abs(p))
export const dirExists = (w: World, p: string) => w.vfs.isDir(abs(p))
export const fileHas = (w: World, p: string, needle: string | RegExp) => { const c = file(w, p); return c !== null && (typeof needle === 'string' ? c.includes(needle) : needle.test(c)) }
export const fileIs = (w: World, p: string, content: string) => (file(w, p) ?? '').trim() === content.trim()
export const hasConflictMarkers = (w: World, p: string) => fileHas(w, p, /^<{7}|^={7}$|^>{7}/m)

export const isClean_ = (w: World, path?: string) => safe(() => { const r = repo(w, path); return !!r && isClean(status(w, r)) }, false)
export { isClean_ as clean }
export const staged = (w: World, path?: string): string[] => safe(() => { const r = repo(w, path); return r ? status(w, r).staged.map((s) => s.path) : [] }, [])
export const unstaged = (w: World, path?: string): string[] => safe(() => { const r = repo(w, path); return r ? status(w, r).unstaged.map((s) => s.path) : [] }, [])
export const untracked = (w: World, path?: string): string[] => safe(() => { const r = repo(w, path); return r ? status(w, r).untracked : [] }, [])
export const conflicts = (w: World, path?: string): string[] => safe(() => [...(repo(w, path)?.conflicts ?? [])], [])
export const isStaged = (w: World, f: string, path?: string) => staged(w, path).includes(f)
export const inIndex = (w: World, f: string, path?: string) => safe(() => f in (repo(w, path)?.index ?? {}), false)
export const opInProgress = (w: World, path?: string) => safe(() => repo(w, path)?.op?.kind ?? null, null)
export const stashCount = (w: World, path?: string) => safe(() => repo(w, path)?.stash.length ?? 0, 0)
/** Did the learner run a command matching `re` (tested against the trimmed command line)? */
export const ran = (w: World, re: RegExp) => w.history.some((c) => re.test(c))
/** Has the learner stood in this directory at any point? */
export const visited = (w: World, p: string) => w.visited.has(abs(p))
export const cwdIs = (w: World, p: string) => w.cwd === abs(p)
export const cwdIn = (w: World, p: string) => w.cwd === abs(p) || w.cwd.startsWith(abs(p) + '/')

// ---------- hub predicates ----------
export const hub = (w: World, key: string): HubRepo | undefined => w.hub.repos[key]
export const hubBranch = (w: World, key: string, name: string): string | null => hub(w, key)?.repo.refs['refs/heads/' + name] ?? null
export const hubTag = (w: World, key: string, name: string): string | null => hub(w, key)?.repo.refs['refs/tags/' + name] ?? null
export const hubFile = (w: World, key: string, f: string, ref?: string): string | null => safe(() => { const h = hub(w, key); if (!h) return null; const hash = h.repo.refs['refs/heads/' + (ref ?? h.defaultBranch)]; return hash ? materialize(w, treeOf(w, hash))[f] ?? null : null }, null)
export const hubLog = (w: World, key: string, ref?: string): string[] => safe(() => { const h = hub(w, key); if (!h) return []; const hash = h.repo.refs['refs/heads/' + (ref ?? h.defaultBranch)]; return hash ? walk(w, [hash]).map((x) => w.commit(x).message) : [] }, [])
export const prs = (w: World, key: string) => hub(w, key)?.prs ?? []
export const openPRs = (w: World, key: string) => prs(w, key).filter((p) => p.state === 'open')
export const mergedPRs = (w: World, key: string) => prs(w, key).filter((p) => p.state === 'merged')
export const issues = (w: World, key: string) => hub(w, key)?.issues ?? []
export const ciPasses = (w: World, key: string, ref: string) => safe(() => { const h = hub(w, key)!; const hash = h.repo.refs['refs/heads/' + ref] ?? ref; return runCI(w, h, hash).ok }, false)
export { hubKey }

/** Does `ref` on the hub contain the same tree as the local HEAD? */
export const hubMatchesLocal = (w: World, key: string, ref: string, path?: string) => { const a = hubBranch(w, key, ref); const b = head(w, path); return !!a && a === b }

export const home = HOME
export { VFS }
