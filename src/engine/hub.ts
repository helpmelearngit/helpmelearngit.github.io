import { short } from './hash'
import { headHash, treeOf, createCommit, mergeBase, mergeTrees, treeFromFiles, commitsBetween, isAncestor, materialize, type TreeMap, branches } from './repo'
import { World, type HubRepo, type PR, type Issue, newRepo, fail } from './world'

export const parseHubUrl = (url: string): string | null => {
  const m = url.match(/^(?:https?:\/\/|git@)github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/)
  return m ? `${m[1]}/${m[2]}` : null
}
export const hubUrl = (key: string) => `https://github.com/${key}.git`
export const hubRepo = (w: World, key: string): HubRepo | undefined => w.hub.repos[key]
export const requireHub = (w: World, key: string): HubRepo => hubRepo(w, key) ?? fail(`repository ${key} not found`)
export const hubKey = (h: HubRepo) => `${h.owner}/${h.name}`

export function notify(w: World, text: string, link?: string) {
  w.hub.notifications.unshift({ text, time: w.clock, link })
  w.hub.notifications = w.hub.notifications.slice(0, 20)
}

export const SIM_USERS: Record<string, { name: string; email: string; avatar: string }> = {
  maya: { name: 'Maya Chen', email: 'maya@example.com', avatar: '🧑‍💻' },
  sam: { name: 'Sam Okafor', email: 'sam@example.com', avatar: '🧔' },
  'octo-org': { name: 'Octo Org', email: 'bot@octo.org', avatar: '🐙' },
}
export const authorOf = (w: World, handle: string) =>
  handle === w.user.handle ? w.authorString() : SIM_USERS[handle] ? `${SIM_USERS[handle].name} <${SIM_USERS[handle].email}>` : `${handle} <${handle}@example.com>`

export function createHubRepo(w: World, owner: string, name: string, opts: { description?: string; readme?: boolean | string; defaultBranch?: string; files?: Record<string, string>; message?: string; author?: string } = {}): HubRepo {
  const key = `${owner}/${name}`
  if (w.hub.repos[key]) fail(`Repository ${key} already exists`)
  const def = opts.defaultBranch ?? 'main'
  const repo = newRepo('hub:' + key, true)
  repo.head = { branch: def }
  const hub: HubRepo = { owner, name, description: opts.description ?? '', repo, defaultBranch: def, prs: [], issues: [], nextNumber: 1, stars: 0, createdAt: w.now() }
  w.hub.repos[key] = hub
  const files: Record<string, string> = { ...(opts.files ?? {}) }
  if (opts.readme) files['README.md'] = typeof opts.readme === 'string' ? opts.readme : `# ${name}\n\n${opts.description ?? ''}\n`
  if (Object.keys(files).length) repo.refs['refs/heads/' + def] = createCommit(w, treeFromFiles(w, files), [], opts.message ?? 'Initial commit', opts.author ?? authorOf(w, owner))
  return hub
}

export function hubResolve(w: World, hub: HubRepo, ref: string): string | null {
  return hub.repo.refs['refs/heads/' + ref] ?? hub.repo.refs['refs/tags/' + ref] ?? (w.objects.has(ref) ? ref : w.findByPrefix(ref))
}
export const hubFiles = (w: World, hub: HubRepo, ref: string): Record<string, string> => {
  const h = hubResolve(w, hub, ref)
  return h ? materialize(w, treeOf(w, h)) : {}
}

/** Commit directly on the hub (simulated teammate pushing). `edits` value null deletes the file. */
export function hubCommit(w: World, hub: HubRepo, branch: string, edits: Record<string, string | null>, message: string, authorHandle = 'maya'): string {
  const ref = 'refs/heads/' + branch
  const parent = hub.repo.refs[ref] ?? hub.repo.refs['refs/heads/' + hub.defaultBranch] ?? null
  const tree: TreeMap = { ...treeOf(w, parent) }
  for (const [p, c] of Object.entries(edits)) { if (c === null) delete tree[p]; else tree[p] = w.put({ type: 'blob', content: c }) }
  const h = createCommit(w, tree, parent ? [parent] : [], message, authorOf(w, authorHandle))
  hub.repo.refs[ref] = h
  notify(w, `${authorHandle} pushed to ${branch} in ${hubKey(hub)}`, hubKey(hub))
  return h
}

export function forkRepo(w: World, srcKey: string, owner: string): HubRepo {
  const src = requireHub(w, srcKey)
  const key = `${owner}/${src.name}`
  if (w.hub.repos[key]) return w.hub.repos[key]
  const repo = newRepo('hub:' + key, true)
  repo.head = { branch: src.defaultBranch }
  repo.refs = Object.fromEntries(Object.entries(src.repo.refs).filter(([k]) => k.startsWith('refs/heads/') || k.startsWith('refs/tags/')))
  const hub: HubRepo = { owner, name: src.name, description: src.description, repo, defaultBranch: src.defaultBranch, forkOf: srcKey, prs: [], issues: [], nextNumber: 1, stars: 0, createdAt: w.now() }
  w.hub.repos[key] = hub
  return hub
}

export function runCI(w: World, hub: HubRepo, hash: string): { ok: boolean; log: string[]; configured: boolean } {
  if (!hub.ci) return { ok: true, log: ['No workflows configured for this repository.'], configured: false }
  const res = hub.ci(materialize(w, treeOf(w, hash)))
  return { ...res, configured: true }
}

export const linkedIssues = (text: string): number[] =>
  [...text.matchAll(/\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s+#(\d+)/gi)].map((m) => +m[1])

export function openPR(w: World, baseKey: string, o: { title: string; body: string; headRepo: string; headBranch: string; base: string; author?: string }): PR {
  const hub = requireHub(w, baseKey)
  const headRepo = requireHub(w, o.headRepo)
  const headHashV = headRepo.repo.refs['refs/heads/' + o.headBranch] ?? fail(`branch ${o.headBranch} not found on ${o.headRepo}`)
  if (!hub.repo.refs['refs/heads/' + o.base]) fail(`base branch ${o.base} not found`)
  if (hub.prs.some((p) => p.state === 'open' && p.head.repo === o.headRepo && p.head.branch === o.headBranch && p.base === o.base)) fail(`A pull request already exists for ${o.headRepo}:${o.headBranch}.`)
  if (!o.title.trim()) fail('Title is required')
  const pr: PR = { number: hub.nextNumber++, title: o.title.trim(), body: o.body, author: o.author ?? w.user.handle, head: { repo: o.headRepo, branch: o.headBranch }, base: o.base, state: 'open', comments: [], reviews: [], createdAt: w.now(), headAtOpen: headHashV }
  hub.prs.unshift(pr)
  notify(w, `${pr.author} opened pull request #${pr.number} in ${baseKey}`, `${baseKey}#${pr.number}`)
  return pr
}

export interface PRState {
  headHash: string | null; baseHash: string; base: string | null
  commits: string[]; changed: { path: string; a?: string; b?: string }[]
  mergeable: boolean; conflicts: string[]; checks: ReturnType<typeof runCI>; blocked: string | null
}
export function prState(w: World, hub: HubRepo, pr: PR): PRState {
  const headRepo = hubRepo(w, pr.head.repo)
  const headHashV = pr.state === 'open' ? headRepo?.repo.refs['refs/heads/' + pr.head.branch] ?? null : pr.headAtOpen
  const baseHash = pr.mergeCommit && pr.state === 'merged' ? (w.commit(pr.mergeCommit).parents[0] ?? pr.mergeCommit) : hub.repo.refs['refs/heads/' + pr.base]
  if (!headHashV) return { headHash: null, baseHash, base: null, commits: [], changed: [], mergeable: false, conflicts: [], checks: { ok: true, log: [], configured: false }, blocked: 'The head branch was deleted.' }
  const base = mergeBase(w, baseHash, headHashV)
  const commits = commitsBetween(w, base, headHashV)
  const baseTree = treeOf(w, base), headTree = treeOf(w, headHashV)
  const changed = [...new Set([...Object.keys(baseTree), ...Object.keys(headTree)])].filter((p) => baseTree[p] !== headTree[p]).sort()
    .map((p) => ({ path: p, a: baseTree[p] ? w.blob(baseTree[p]) : undefined, b: headTree[p] ? w.blob(headTree[p]) : undefined }))
  const res = base ? mergeTrees(w, baseTree, treeOf(w, baseHash), headTree, pr.base, pr.head.branch) : { conflicts: [] as string[] }
  const checks = runCI(w, hub, headHashV)
  let blocked: string | null = null
  if (pr.state !== 'open') blocked = pr.state === 'merged' ? 'Pull request successfully merged and closed' : 'This pull request is closed'
  else if (!commits.length) blocked = `${pr.head.branch} has no new commits compared to ${pr.base}.`
  else if (res.conflicts.length) blocked = 'This branch has conflicts that must be resolved'
  else if (hub.protection?.branch === pr.base && hub.protection.requireChecks && !checks.ok) blocked = 'Required status check "ci" is failing'
  return { headHash: headHashV, baseHash, base, commits, changed, mergeable: !blocked, conflicts: res.conflicts, checks, blocked }
}

export function mergePR(w: World, hub: HubRepo, number: number, method: 'merge' | 'squash' | 'rebase', deleteBranch = false, actor = w.user.handle): string {
  const pr = hub.prs.find((p) => p.number === number) ?? fail(`PR #${number} not found`)
  const st = prState(w, hub, pr)
  if (!st.mergeable) fail(st.blocked ?? 'Not mergeable')
  const baseHash = st.baseHash, headH = st.headHash!
  const baseTree = treeOf(w, baseHash)
  const merged = mergeTrees(w, treeOf(w, st.base), baseTree, treeOf(w, headH), pr.base, pr.head.branch)
  const mergedTree = treeFromFiles(w, merged.files)
  let tip: string
  const author = authorOf(w, actor)
  if (method === 'merge') tip = createCommit(w, mergedTree, [baseHash, headH], `Merge pull request #${pr.number} from ${pr.head.repo.split('/')[0]}/${pr.head.branch}\n\n${pr.title}`, author)
  else if (method === 'squash') tip = createCommit(w, mergedTree, [baseHash], `${pr.title} (#${pr.number})\n\n${st.commits.map((c) => '* ' + w.commit(c).message.split('\n')[0]).join('\n')}`, author)
  else {
    tip = baseHash
    for (const c of st.commits) {
      const commit = w.commit(c)
      const res = mergeTrees(w, treeOf(w, commit.parents[0] ?? null), treeOf(w, tip), w.tree(commit.tree), pr.base, pr.head.branch)
      if (res.conflicts.length) fail('Rebase merge hit a conflict; use a merge commit instead.')
      tip = createCommit(w, treeFromFiles(w, res.files), [tip], commit.message, commit.author)
    }
  }
  hub.repo.refs['refs/heads/' + pr.base] = tip
  pr.state = 'merged'; pr.mergedAs = method; pr.mergeCommit = tip
  for (const n of linkedIssues(pr.body + '\n' + st.commits.map((c) => w.commit(c).message).join('\n'))) {
    const is = hub.issues.find((i) => i.number === n)
    if (is && is.state === 'open') { is.state = 'closed'; is.closedBy = pr.number }
  }
  if (deleteBranch && pr.head.repo === hubKey(hub) && pr.head.branch !== hub.defaultBranch) delete hub.repo.refs['refs/heads/' + pr.head.branch]
  notify(w, `${actor} merged pull request #${pr.number} in ${hubKey(hub)}`, `${hubKey(hub)}#${pr.number}`)
  return tip
}

export function closePR(w: World, hub: HubRepo, number: number) {
  const pr = hub.prs.find((p) => p.number === number) ?? fail(`PR #${number} not found`)
  if (pr.state !== 'open') return
  const headRepo = hubRepo(w, pr.head.repo)
  pr.headAtOpen = headRepo?.repo.refs['refs/heads/' + pr.head.branch] ?? pr.headAtOpen
  pr.state = 'closed'
}
export function commentPR(w: World, hub: HubRepo, number: number, body: string, author = w.user.handle) {
  const pr = hub.prs.find((p) => p.number === number) ?? fail(`PR #${number} not found`)
  pr.comments.push({ author, body, time: w.now() })
}
export function reviewPR(w: World, hub: HubRepo, number: number, state: PR['reviews'][number]['state'], body: string, author: string) {
  const pr = hub.prs.find((p) => p.number === number) ?? fail(`PR #${number} not found`)
  pr.reviews.push({ author, state, body, time: w.now() })
  notify(w, `${author} ${state === 'approved' ? 'approved' : state === 'changes_requested' ? 'requested changes on' : 'commented on'} pull request #${number}`, `${hubKey(hub)}#${number}`)
}
export function createIssue(w: World, hub: HubRepo, o: { title: string; body: string; author?: string; labels?: string[] }): Issue {
  if (!o.title.trim()) fail('Title is required')
  const is: Issue = { number: hub.nextNumber++, title: o.title.trim(), body: o.body, author: o.author ?? w.user.handle, state: 'open', comments: [], createdAt: w.now(), labels: o.labels ?? [] }
  hub.issues.unshift(is)
  return is
}
export function closeIssue(w: World, hub: HubRepo, number: number, reopen = false) {
  const is = hub.issues.find((i) => i.number === number) ?? fail(`Issue #${number} not found`)
  is.state = reopen ? 'open' : 'closed'
  void w
}
export function commentIssue(w: World, hub: HubRepo, number: number, body: string, author = w.user.handle) {
  const is = hub.issues.find((i) => i.number === number) ?? fail(`Issue #${number} not found`)
  is.comments.push({ author, body, time: w.now() })
}

/** Hub-side branch list with ahead/behind vs default. */
export function hubBranches(w: World, hub: HubRepo) {
  const def = hub.repo.refs['refs/heads/' + hub.defaultBranch]
  return branches(hub.repo).map((b) => {
    const h = hub.repo.refs['refs/heads/' + b]
    return { name: b, hash: h, ahead: def ? commitsBetween(w, def, h).length : 0, behind: def ? commitsBetween(w, h, def).length : 0, isDefault: b === hub.defaultBranch, merged: def ? isAncestor(w, h, def) : false }
  })
}
export { short, headHash }
