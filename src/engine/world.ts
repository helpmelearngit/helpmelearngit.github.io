import { VFS, HOME } from './vfs'
import { hash } from './hash'

export interface Commit { type: 'commit'; tree: string; parents: string[]; message: string; author: string; time: number }
export interface Tree { type: 'tree'; entries: Record<string, string> } // relative path -> blob hash (flat; ponytail: no nested tree objects)
export interface Blob { type: 'blob'; content: string }
export type GitObject = Commit | Tree | Blob

export type Head = { branch: string } | { detached: string }

export type RepoOp =
  | { kind: 'merge'; theirs: string; theirsName: string; message: string }
  | { kind: 'rebase'; onto: string; todo: string[]; current?: string; origHead: string; branch: string | null }
  | { kind: 'cherry-pick'; hash: string }
  | { kind: 'revert'; hash: string }

export interface Repo {
  root: string // worktree path, or 'hub:owner/name' for bare hub repos
  bare: boolean
  head: Head
  refs: Record<string, string> // 'refs/heads/main' | 'refs/tags/v1' | 'refs/remotes/origin/main' -> commit hash
  index: Record<string, string> // path -> blob hash
  remotes: Record<string, string> // name -> url
  upstream: Record<string, string> // local branch -> 'origin/main'
  stash: string[] // commit hashes, newest first
  reflog: { hash: string; msg: string }[] // newest first
  conflicts: Set<string>
  op?: RepoOp
  origHead?: string
  prevBranch?: string
  config: Record<string, string>
}

export interface Span { t: string; c?: 'err' | 'ok' | 'warn' | 'dim' | 'add' | 'del' | 'hunk' | 'meta' | 'head' | 'branch' | 'remote' | 'tag' | 'hash' | 'bold' }
export type OutLine = Span[]
export const line = (t: string, c?: Span['c']): OutLine => [{ t, c }]

// ---- GitHub-clone state ----
export interface HubComment { author: string; body: string; time: number }
export interface PR {
  number: number; title: string; body: string; author: string
  head: { repo: string; branch: string }; base: string
  state: 'open' | 'merged' | 'closed'
  comments: HubComment[]
  reviews: { author: string; state: 'approved' | 'changes_requested' | 'commented'; body: string; time: number }[]
  mergedAs?: 'merge' | 'squash' | 'rebase'
  mergeCommit?: string
  createdAt: number
  headAtOpen: string
}
export interface Issue {
  number: number; title: string; body: string; author: string
  state: 'open' | 'closed'; comments: HubComment[]; closedBy?: number; createdAt: number; labels: string[]
}
export interface HubRepo {
  owner: string; name: string; description: string
  repo: Repo
  defaultBranch: string
  forkOf?: string // 'owner/name'
  prs: PR[]; issues: Issue[]
  nextNumber: number
  protection?: { branch: string; requirePR?: boolean; requireChecks?: boolean }
  /** Handles allowed to merge PRs besides the owner. */
  collaborators?: string[]
  /** CI rule: given the files at a commit, pass/fail. Lessons set this. */
  ci?: (files: Record<string, string>) => { ok: boolean; log: string[] }
  stars: number
  createdAt: number
}
export interface HubState {
  repos: Record<string, HubRepo> // 'owner/name'
  notifications: { text: string; time: number; link?: string }[]
}

export const newRepo = (root: string, bare = false): Repo => ({
  root, bare, head: { branch: 'main' }, refs: {}, index: {}, remotes: {}, upstream: {}, stash: [], reflog: [], conflicts: new Set(), config: {},
})

export class World {
  objects = new Map<string, GitObject>()
  vfs = new VFS()
  cwd = HOME
  repos = new Map<string, Repo>()
  hub: HubState = { repos: {}, notifications: [] }
  user = { name: 'You', email: 'you@example.com', handle: 'you' }
  config: Record<string, string> = {}
  clock = Date.UTC(2026, 9, 5, 9, 0, 0) / 1000
  /** Every command line the learner ran this session, and every cwd they stood in. For lesson checks. */
  history: string[] = []
  visited = new Set<string>()
  version = 0
  private listeners = new Set<() => void>()

  subscribe(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }
  bump() { this.version++; for (const l of this.listeners) l() }

  now() { this.clock += 180 + ((this.clock / 7) % 240 | 0); return this.clock }

  put(o: GitObject): string {
    const key = o.type === 'blob' ? 'blob\0' + o.content : o.type === 'tree' ? 'tree\0' + JSON.stringify(Object.entries(o.entries).sort()) : 'commit\0' + JSON.stringify([o.tree, o.parents, o.message, o.author, o.time])
    const h = hash(key)
    // store a copy: callers often keep mutating the tree they passed in
    if (!this.objects.has(h)) this.objects.set(h, o.type === 'tree' ? { type: 'tree', entries: { ...o.entries } } : o)
    return h
  }
  get<T extends GitObject>(h: string): T {
    const o = this.objects.get(h)
    if (!o) throw new Error(`fatal: bad object ${h}`)
    return o as T
  }
  commit(h: string): Commit { return this.get<Commit>(h) }
  blob(h: string): string { return this.get<Blob>(h).content }
  tree(h: string): Record<string, string> { return this.get<Tree>(h).entries }

  /** Find a hash by unique prefix. */
  findByPrefix(prefix: string): string | null {
    if (prefix.length < 4) return null
    const m = [...this.objects.keys()].filter((k) => k.startsWith(prefix) && this.objects.get(k)!.type === 'commit')
    return m.length === 1 ? m[0] : null
  }

  authorString() { return `${this.user.name} <${this.user.email}>` }
}

export const fmtDate = (t: number) => {
  const d = new Date(t * 1000)
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  const p = (n: number) => String(n).padStart(2, '0')
  return `${days[d.getUTCDay()]} ${mons[d.getUTCMonth()]} ${d.getUTCDate()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} ${d.getUTCFullYear()} +0000`
}

export class GitError extends Error {}
export function fail(msg: string): never { throw new GitError(msg) }
