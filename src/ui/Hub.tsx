import { useState } from 'react'
import type { Session, HubRoute } from './session'
import { useWorld } from '../store/world'
import { World, type HubRepo, type PR, type Issue } from '../engine/world'
import { hubKey, hubBranches, hubFiles, prState, mergePR, closePR, commentPR, createHubRepo, forkRepo, openPR, createIssue, closeIssue, commentIssue, runCI, SIM_USERS, hubUrl } from '../engine/hub'
import { walk, subject, commitsBetween, mergeBase, treeOf } from '../engine/repo'
import { short } from '../engine/hash'
import { unifiedDiff } from '../engine/diff'
import { Article } from './Article'

const ago = (w: World, t: number) => { const d = Math.max(0, w.clock - t); if (d < 90) return 'just now'; if (d < 3600) return `${Math.round(d / 60)} minutes ago`; if (d < 86400) return `${Math.round(d / 3600)} hours ago`; return `${Math.round(d / 86400)} days ago` }
const avatar = (w: World, h: string) => (h === w.user.handle ? '🧑‍🍳' : SIM_USERS[h]?.avatar ?? '👤')
const canWrite = (w: World, h: HubRepo) => h.owner === w.user.handle || (h.collaborators ?? []).includes(w.user.handle)

export function Hub({ session }: { session: Session }) {
  useWorld(session.world)
  const w = session.world
  const route = session.hubRoute
  const go = (r: HubRoute) => session.go(r)
  const [err, setErr] = useState<string | null>(null)
  const act = (fn: (w: World) => void) => { const e = session.act(fn); setErr(e); return e === null }

  const key = 'key' in route ? route.key : null
  const hub = key ? w.hub.repos[key] : undefined
  if (key && !hub) return <Shell session={session} go={go}><div className="p-8 text-center text-ink-400">Repository {key} not found.</div></Shell>

  return (
    <Shell session={session} go={go}>
      {err && <div className="mx-4 mt-3 rounded-lg border border-ember-500 bg-ember-100 px-3 py-2 text-sm text-ember-600">{err} <button className="ml-2 underline" onClick={() => setErr(null)}>dismiss</button></div>}
      {route.page === 'home' && <Home w={w} go={go} />}
      {route.page === 'new-repo' && <NewRepo w={w} go={go} act={act} />}
      {route.page === 'repo' && hub && <RepoPage w={w} hub={hub} route={route} go={go} act={act} />}
      {route.page === 'pr' && hub && <PRPage w={w} hub={hub} number={route.number} tab={route.tab ?? 'conversation'} go={go} act={act} />}
      {route.page === 'new-pr' && hub && <NewPR w={w} hub={hub} route={route} go={go} act={act} />}
      {route.page === 'issue' && hub && <IssuePage w={w} hub={hub} number={route.number} go={go} act={act} />}
      {route.page === 'new-issue' && hub && <NewIssue w={w} hub={hub} go={go} act={act} />}
    </Shell>
  )
}

function Shell({ session, go, children }: { session: Session; go: (r: HubRoute) => void; children: React.ReactNode }) {
  const w = session.world
  const [notif, setNotif] = useState(false)
  return (
    <div className="flex h-full flex-col overflow-hidden bg-[#f6f8fa] text-[13px] text-[#1f2328]">
      <div className="flex h-11 shrink-0 items-center gap-3 bg-[#24292f] px-4 text-white">
        <button onClick={() => go({ page: 'home' })} className="flex items-center gap-2 font-semibold"><span className="text-lg">🐙</span> GitHub <span className="rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-normal">simulated</span></button>
        <div className="ml-auto flex items-center gap-3">
          <button onClick={() => setNotif(!notif)} className="relative rounded px-2 py-1 hover:bg-white/10" title="Notifications">🔔{w.hub.notifications.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-sky-500" />}</button>
          <span className="flex items-center gap-1.5 text-[12px]"><span>{avatar(w, w.user.handle)}</span>{w.user.handle}</span>
        </div>
      </div>
      {notif && (
        <div className="shrink-0 border-b border-[#d0d7de] bg-white px-4 py-2">
          <div className="mb-1 text-[11px] font-semibold uppercase text-ink-400">Notifications</div>
          {w.hub.notifications.length === 0 && <div className="text-ink-400">Nothing yet.</div>}
          {w.hub.notifications.slice(0, 6).map((n, i) => <div key={i} className="py-0.5">{n.text} <span className="text-ink-400">· {ago(w, n.time)}</span></div>)}
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </div>
  )
}

function Home({ w, go }: { w: World; go: (r: HubRoute) => void }) {
  const repos = Object.values(w.hub.repos)
  const mine = repos.filter((r) => r.owner === w.user.handle)
  const others = repos.filter((r) => r.owner !== w.user.handle)
  const Card = ({ r }: { r: HubRepo }) => (
    <button onClick={() => go({ page: 'repo', key: hubKey(r), tab: 'code' })} className="flex w-full flex-col rounded-lg border border-[#d0d7de] bg-white p-3 text-left hover:border-[#0969da]">
      <div className="font-semibold text-[#0969da]">{r.owner}/{r.name} {r.forkOf && <span className="pill ml-1 bg-ink-100 text-ink-600">fork</span>}</div>
      <div className="text-ink-400">{r.description || 'No description'}{r.forkOf && ` · forked from ${r.forkOf}`}</div>
    </button>
  )
  return (
    <div className="mx-auto max-w-3xl p-5">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold">Your repositories</h2><button onClick={() => go({ page: 'new-repo' })} className="btn-green text-[12px] py-1.5">New repository</button></div>
      {mine.length === 0 && <div className="rounded-lg border border-dashed border-[#d0d7de] bg-white p-6 text-center text-ink-400">You have no repositories yet. Click <b>New repository</b> to create one.</div>}
      <div className="grid gap-2">{mine.map((r) => <Card key={hubKey(r)} r={r} />)}</div>
      {others.length > 0 && <><h2 className="mb-3 mt-8 text-lg font-semibold">Explore</h2><div className="grid gap-2">{others.map((r) => <Card key={hubKey(r)} r={r} />)}</div></>}
    </div>
  )
}

function NewRepo({ w, go, act }: { w: World; go: (r: HubRoute) => void; act: (fn: (w: World) => void) => boolean }) {
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [readme, setReadme] = useState(false)
  return (
    <div className="mx-auto max-w-xl p-6">
      <h2 className="mb-1 text-xl font-semibold">Create a new repository</h2>
      <p className="mb-5 text-ink-400">A repository contains all project files, including the revision history.</p>
      <label className="mb-3 block"><span className="mb-1 block font-semibold">Repository name *</span><div className="flex items-center gap-2"><span className="text-ink-400">{w.user.handle} /</span><input value={name} onChange={(e) => setName(e.target.value.replace(/[^\w.-]/g, '-'))} className="flex-1 rounded-md border border-[#d0d7de] px-2 py-1.5" placeholder="sunrise-bakery" /></div></label>
      <label className="mb-3 block"><span className="mb-1 block font-semibold">Description <span className="font-normal text-ink-400">(optional)</span></span><input value={desc} onChange={(e) => setDesc(e.target.value)} className="w-full rounded-md border border-[#d0d7de] px-2 py-1.5" /></label>
      <label className="mb-5 flex items-center gap-2"><input type="checkbox" checked={readme} onChange={(e) => setReadme(e.target.checked)} /> Add a README file <span className="text-ink-400">(creates a first commit on GitHub; leave unchecked when you already have local history to push)</span></label>
      <button disabled={!name} onClick={() => { const n = name; if (act((w) => { createHubRepo(w, w.user.handle, n, { description: desc, readme }) })) go({ page: 'repo', key: `${w.user.handle}/${n}`, tab: 'code' }) }} className="btn-green disabled:opacity-50">Create repository</button>
    </div>
  )
}

function RepoHeader({ w, hub, tab, go, act }: { w: World; hub: HubRepo; tab: string; go: (r: HubRoute) => void; act: (fn: (w: World) => void) => boolean }) {
  const key = hubKey(hub)
  const myFork = Object.values(w.hub.repos).find((r) => r.forkOf === key && r.owner === w.user.handle)
  const tabs: [Extract<HubRoute, { page: 'repo' }>['tab'], string, number | null][] = [
    ['code', 'Code', null], ['issues', 'Issues', hub.issues.filter((i) => i.state === 'open').length], ['prs', 'Pull requests', hub.prs.filter((p) => p.state === 'open').length], ['actions', 'Actions', null], ['settings', 'Settings', null],
  ]
  return (
    <div className="border-b border-[#d0d7de] bg-white px-5 pt-4">
      <div className="flex items-center gap-2">
        <span className="text-ink-400">📁</span>
        <span className="text-lg"><span className="text-[#0969da]">{hub.owner}</span> / <span className="font-semibold text-[#0969da]">{hub.name}</span></span>
        <span className="pill border border-[#d0d7de] text-ink-600">Public</span>
        <div className="ml-auto flex gap-2">
          {hub.owner !== w.user.handle && !myFork && <button onClick={() => { if (act((w) => { forkRepo(w, key, w.user.handle) })) go({ page: 'repo', key: `${w.user.handle}/${hub.name}`, tab: 'code' }) }} className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1 font-semibold hover:bg-[#eef1f5]">🍴 Fork</button>}
          {myFork && hub.owner !== w.user.handle && <button onClick={() => go({ page: 'repo', key: hubKey(myFork), tab: 'code' })} className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1 font-semibold">🍴 Your fork: {hubKey(myFork)}</button>}
          <span className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1">⭐ Star <span className="ml-1 rounded-full bg-ink-100 px-1.5">{hub.stars}</span></span>
        </div>
      </div>
      {hub.forkOf && <div className="mt-1 text-ink-400">forked from <button className="text-[#0969da] hover:underline" onClick={() => go({ page: 'repo', key: hub.forkOf!, tab: 'code' })}>{hub.forkOf}</button></div>}
      <div className="mt-3 flex gap-1">
        {tabs.map(([t, label, n]) => <button key={t} onClick={() => go({ page: 'repo', key, tab: t })} className={`flex items-center gap-1.5 border-b-2 px-3 py-2 hover:bg-[#f6f8fa] ${tab === t ? 'border-[#fd8c73] font-semibold' : 'border-transparent'}`}>{label}{n !== null && n > 0 && <span className="rounded-full bg-ink-100 px-1.5 text-[11px]">{n}</span>}</button>)}
      </div>
    </div>
  )
}

function RepoPage({ w, hub, route, go, act }: { w: World; hub: HubRepo; route: Extract<HubRoute, { page: 'repo' }>; go: (r: HubRoute) => void; act: (fn: (w: World) => void) => boolean }) {
  const tabKey = route.tab === 'commits' || route.tab === 'branches' ? 'code' : route.tab
  return (
    <div>
      <RepoHeader w={w} hub={hub} tab={tabKey} go={go} act={act} />
      <div className="mx-auto max-w-4xl p-5">
        {route.tab === 'code' && <CodeTab w={w} hub={hub} refName={route.ref ?? hub.defaultBranch} path={route.path ?? ''} go={go} />}
        {route.tab === 'commits' && <CommitsTab w={w} hub={hub} refName={route.ref ?? hub.defaultBranch} go={go} />}
        {route.tab === 'branches' && <BranchesTab w={w} hub={hub} go={go} act={act} />}
        {route.tab === 'prs' && <PRsTab w={w} hub={hub} go={go} />}
        {route.tab === 'issues' && <IssuesTab w={w} hub={hub} go={go} />}
        {route.tab === 'actions' && <ActionsTab w={w} hub={hub} />}
        {route.tab === 'settings' && <SettingsTab w={w} hub={hub} />}
      </div>
    </div>
  )
}

function CodeTab({ w, hub, refName, path, go }: { w: World; hub: HubRepo; refName: string; path: string; go: (r: HubRoute) => void }) {
  const key = hubKey(hub)
  const tip = hub.repo.refs['refs/heads/' + refName]
  const url = hubUrl(key)
  if (!tip) {
    const cmds = `git remote add origin ${url}\ngit branch -M main\ngit push -u origin main`
    return (
      <div className="rounded-lg border border-[#d0d7de] bg-white p-5">
        <h3 className="mb-1 text-lg font-semibold">Quick setup — if you've done this kind of thing before</h3>
        <div className="mb-4 flex items-center gap-2"><span className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2 py-1 font-mono text-[12px]">HTTPS</span><code className="flex-1 rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2 py-1 font-mono text-[12px]">{url}</code></div>
        <h4 className="mb-1 font-semibold">…or push an existing repository from the command line</h4>
        <pre className="rounded-md bg-[#f6f8fa] p-3 font-mono text-[12px]">{cmds}</pre>
        <p className="mt-3 text-ink-400">This repository is empty. Push a branch and the files will show up here.</p>
      </div>
    )
  }
  const files = hubFiles(w, hub, refName)
  const prefix = path ? path + '/' : ''
  const entries = new Map<string, boolean>()
  for (const f of Object.keys(files)) if (f.startsWith(prefix)) { const rest = f.slice(prefix.length); const i = rest.indexOf('/'); entries.set(i < 0 ? rest : rest.slice(0, i), i >= 0) }
  const isFile = path && path in files
  const headCommit = w.commit(tip)
  const n = walk(w, [tip]).length
  const branches = hubBranches(w, hub)
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <select value={refName} onChange={(e) => go({ page: 'repo', key, tab: 'code', ref: e.target.value })} className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2 py-1 font-semibold">{branches.map((b) => <option key={b.name} value={b.name}>🌿 {b.name}</option>)}</select>
        <button onClick={() => go({ page: 'repo', key, tab: 'branches' })} className="text-ink-600 hover:text-[#0969da]">{branches.length} branch{branches.length === 1 ? '' : 'es'}</button>
        <span className="text-ink-300">·</span>
        <button onClick={() => go({ page: 'repo', key, tab: 'commits', ref: refName })} className="text-ink-600 hover:text-[#0969da]">🕘 {n} commit{n === 1 ? '' : 's'}</button>
        <div className="ml-auto flex items-center gap-2"><span className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2 py-1 font-mono text-[11px]">{url}</span></div>
      </div>
      {path && <div className="mb-2 text-[12px]"><button className="text-[#0969da]" onClick={() => go({ page: 'repo', key, tab: 'code', ref: refName })}>{hub.name}</button>{path.split('/').map((seg, i, arr) => <span key={i}> / <button className="text-[#0969da]" onClick={() => go({ page: 'repo', key, tab: 'code', ref: refName, path: arr.slice(0, i + 1).join('/') })}>{seg}</button></span>)}</div>}
      <div className="overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
        <div className="flex items-center gap-2 border-b border-[#d0d7de] bg-[#f6f8fa] px-3 py-2"><span>{avatar(w, headCommit.author.split(' <')[0] === w.user.name ? w.user.handle : 'maya')}</span><span className="font-semibold">{headCommit.author.split(' <')[0]}</span><span className="truncate text-ink-600">{subject(headCommit.message)}</span><span className="ml-auto font-mono text-ink-400">{short(tip)} · {ago(w, headCommit.time)}</span></div>
        {isFile ? <pre className="overflow-auto p-4 font-mono text-[12px] leading-relaxed">{files[path].split('\n').map((l, i) => <div key={i}><span className="mr-4 inline-block w-6 select-none text-right text-ink-300">{i + 1}</span>{l}</div>)}</pre>
          : [...entries].sort((a, b) => Number(b[1]) - Number(a[1]) || a[0].localeCompare(b[0])).map(([name, dir]) => <button key={name} onClick={() => go({ page: 'repo', key, tab: 'code', ref: refName, path: prefix + name })} className="flex w-full items-center gap-2 border-b border-[#eaeef2] px-3 py-1.5 text-left last:border-0 hover:bg-[#f6f8fa]"><span>{dir ? '📁' : '📄'}</span><span className="text-[#0969da]">{name}</span></button>)}
      </div>
      {!isFile && files[prefix + 'README.md'] && <div className="mt-4 rounded-lg border border-[#d0d7de] bg-white p-6"><div className="mb-2 border-b border-[#d0d7de] pb-2 font-semibold">README.md</div><Article md={files[prefix + 'README.md']} className="text-[14px]" /></div>}
    </div>
  )
}

function CommitsTab({ w, hub, refName, go }: { w: World; hub: HubRepo; refName: string; go: (r: HubRoute) => void }) {
  const tip = hub.repo.refs['refs/heads/' + refName]
  const list = tip ? walk(w, [tip]) : []
  return (
    <div>
      <div className="mb-3 flex items-center gap-2"><span className="font-semibold">Commits on</span><select value={refName} onChange={(e) => go({ page: 'repo', key: hubKey(hub), tab: 'commits', ref: e.target.value })} className="rounded-md border border-[#d0d7de] bg-[#f6f8fa] px-2 py-1">{hubBranches(w, hub).map((b) => <option key={b.name}>{b.name}</option>)}</select></div>
      <CommitList w={w} hashes={list} />
    </div>
  )
}
function CommitList({ w, hashes }: { w: World; hashes: string[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
      {hashes.length === 0 && <div className="p-4 text-ink-400">No commits.</div>}
      {hashes.map((h) => { const c = w.commit(h); return (
        <div key={h} className="flex items-start gap-3 border-b border-[#eaeef2] px-3 py-2 last:border-0">
          <div className="min-w-0 flex-1"><div className="truncate font-semibold">{subject(c.message)}{c.parents.length > 1 && <span className="pill ml-2 bg-plum-500/10 text-plum-500">merge</span>}</div><div className="text-ink-400">{c.author.split(' <')[0]} committed {ago(w, c.time)}</div></div>
          <code className="rounded border border-[#d0d7de] px-1.5 py-0.5 font-mono text-[11px] text-[#0969da]">{short(h)}</code>
        </div>) })}
    </div>
  )
}

function BranchesTab({ w, hub, go, act }: { w: World; hub: HubRepo; go: (r: HubRoute) => void; act: (fn: (w: World) => void) => boolean }) {
  const key = hubKey(hub)
  return (
    <div className="overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-[#d0d7de] bg-[#f6f8fa] px-3 py-2 font-semibold"><span>Branch</span><span>Behind | Ahead</span><span>Pull request</span><span /></div>
      {hubBranches(w, hub).map((b) => {
        const pr = hub.prs.find((p) => p.state === 'open' && p.head.repo === key && p.head.branch === b.name)
        return (
          <div key={b.name} className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-[#eaeef2] px-3 py-2 last:border-0">
            <div><button className="font-mono text-[#0969da]" onClick={() => go({ page: 'repo', key, tab: 'code', ref: b.name })}>{b.name}</button> {b.isDefault && <span className="pill border border-[#d0d7de] text-ink-600">Default</span>} {hub.protection?.branch === b.name && <span className="pill border border-[#d0d7de] text-ink-600">🛡 Protected</span>}<div className="text-ink-400">Updated {ago(w, w.commit(b.hash).time)} · {short(b.hash)}</div></div>
            <div className="font-mono text-ink-600">{b.isDefault ? '—' : <><span className="text-ember-500">{b.behind}</span> | <span className="text-leaf-500">{b.ahead}</span></>}</div>
            <div>{pr ? <button className="text-[#0969da]" onClick={() => go({ page: 'pr', key, number: pr.number })}>#{pr.number}</button> : !b.isDefault && b.ahead > 0 ? <button className="rounded-md border border-[#d0d7de] px-2 py-0.5 text-[12px] font-semibold hover:bg-[#f6f8fa]" onClick={() => go({ page: 'new-pr', key, head: b.name, headRepo: key })}>New pull request</button> : <span className="text-ink-300">—</span>}</div>
            <div>{!b.isDefault && canWrite(w, hub) && <button title="Delete branch" onClick={() => act((w) => { delete w.hub.repos[key].repo.refs['refs/heads/' + b.name] })} className="rounded px-2 py-0.5 text-ink-400 hover:bg-ember-100 hover:text-ember-600">🗑</button>}</div>
          </div>)
      })}
    </div>
  )
}

const StateBadge = ({ state }: { state: PR['state'] | Issue['state'] }) => <span className={`pill text-white ${state === 'open' ? 'bg-[#1f883d]' : state === 'merged' ? 'bg-[#8250df]' : 'bg-[#cf222e]'}`}>{state === 'open' ? '⊙ Open' : state === 'merged' ? '⇄ Merged' : '⊘ Closed'}</span>

function PRsTab({ w, hub, go }: { w: World; hub: HubRepo; go: (r: HubRoute) => void }) {
  const [filter, setFilter] = useState<'open' | 'closed'>('open')
  const key = hubKey(hub)
  const list = hub.prs.filter((p) => (filter === 'open' ? p.state === 'open' : p.state !== 'open'))
  return (
    <div>
      <div className="mb-3 flex items-center gap-3"><button onClick={() => setFilter('open')} className={filter === 'open' ? 'font-semibold' : 'text-ink-400'}>⊙ {hub.prs.filter((p) => p.state === 'open').length} Open</button><button onClick={() => setFilter('closed')} className={filter === 'closed' ? 'font-semibold' : 'text-ink-400'}>✓ {hub.prs.filter((p) => p.state !== 'open').length} Closed</button><button onClick={() => go({ page: 'new-pr', key })} className="btn-green ml-auto py-1.5 text-[12px]">New pull request</button></div>
      <div className="overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
        {list.length === 0 && <div className="p-8 text-center text-ink-400">{filter === 'open' ? 'There aren’t any open pull requests. Push a branch, then click New pull request.' : 'No closed pull requests.'}</div>}
        {list.map((p) => <button key={p.number} onClick={() => go({ page: 'pr', key, number: p.number })} className="flex w-full items-start gap-3 border-b border-[#eaeef2] px-3 py-2 text-left last:border-0 hover:bg-[#f6f8fa]"><span className={p.state === 'open' ? 'text-[#1f883d]' : p.state === 'merged' ? 'text-[#8250df]' : 'text-[#cf222e]'}>{p.state === 'merged' ? '⇄' : '⊙'}</span><div><div className="font-semibold">{p.title} <span className="font-normal text-ink-400">#{p.number}</span></div><div className="text-ink-400">{p.author} wants to merge <code className="rounded bg-[#ddf4ff] px-1 text-[#0969da]">{p.head.repo === key ? '' : p.head.repo.split('/')[0] + ':'}{p.head.branch}</code> into <code className="rounded bg-[#ddf4ff] px-1 text-[#0969da]">{p.base}</code> · {ago(w, p.createdAt)}</div></div></button>)}
      </div>
    </div>
  )
}

function Checks({ w, hub, hash }: { w: World; hub: HubRepo; hash: string }) {
  const c = runCI(w, hub, hash)
  if (!c.configured) return <div className="text-ink-400">No checks configured.</div>
  return <div className={`flex items-center gap-2 ${c.ok ? 'text-[#1f883d]' : 'text-[#cf222e]'}`}><span className="text-lg">{c.ok ? '✓' : '✕'}</span><b>ci</b> — {c.ok ? 'All checks have passed' : 'Some checks were not successful'}</div>
}

function NewPR({ w, hub, route, go, act }: { w: World; hub: HubRepo; route: Extract<HubRoute, { page: 'new-pr' }>; go: (r: HubRoute) => void; act: (fn: (w: World) => void) => boolean }) {
  const key = hubKey(hub)
  const headRepos = [key, ...Object.values(w.hub.repos).filter((r) => r.forkOf === key).map(hubKey)]
  const [headRepo, setHeadRepo] = useState(route.headRepo ?? (hub.forkOf && hub.owner === w.user.handle ? key : key))
  const baseRepoKey = hub.forkOf && hub.owner === w.user.handle ? hub.forkOf : key
  const baseRepo = w.hub.repos[baseRepoKey]
  const hr = w.hub.repos[headRepo]
  const headBranches = hubBranches(w, hr)
  const [head, setHead] = useState(route.head ?? headBranches.find((b) => !b.isDefault)?.name ?? hr.defaultBranch)
  const [base, setBase] = useState(baseRepo.defaultBranch)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const headHashV = hr.repo.refs['refs/heads/' + head], baseHashV = baseRepo.repo.refs['refs/heads/' + base]
  const mb = headHashV && baseHashV ? mergeBase(w, baseHashV, headHashV) : null
  const commits = headHashV && baseHashV ? commitsBetween(w, mb, headHashV) : []
  const changed = headHashV && baseHashV ? Object.keys({ ...treeOf(w, mb), ...treeOf(w, headHashV) }).filter((p) => treeOf(w, mb)[p] !== treeOf(w, headHashV)[p]) : []
  const crossFork = baseRepoKey !== key || headRepo !== baseRepoKey
  return (
    <div>
      <RepoHeader w={w} hub={hub} tab="prs" go={go} act={act} />
      <div className="mx-auto max-w-3xl p-5">
        <h2 className="mb-1 text-xl font-semibold">Comparing changes</h2>
        <p className="mb-3 text-ink-400">Choose two branches to see what’s changed. {crossFork && 'Comparing across forks.'}</p>
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-[#d0d7de] bg-[#f6f8fa] p-3">
          <span>base repository: <b>{baseRepoKey}</b></span>
          <span>base: <select value={base} onChange={(e) => setBase(e.target.value)} className="rounded-md border border-[#d0d7de] bg-white px-2 py-1">{hubBranches(w, baseRepo).map((b) => <option key={b.name}>{b.name}</option>)}</select></span>
          <span className="text-ink-400">←</span>
          <span>head repository: <select value={headRepo} onChange={(e) => { setHeadRepo(e.target.value); setHead(w.hub.repos[e.target.value].defaultBranch) }} className="rounded-md border border-[#d0d7de] bg-white px-2 py-1">{[...new Set([...headRepos, ...(baseRepoKey !== key ? [baseRepoKey] : [])])].map((k) => <option key={k}>{k}</option>)}</select></span>
          <span>compare: <select value={head} onChange={(e) => setHead(e.target.value)} className="rounded-md border border-[#d0d7de] bg-white px-2 py-1">{headBranches.map((b) => <option key={b.name}>{b.name}</option>)}</select></span>
        </div>
        <div className="mb-4 text-ink-600">{commits.length === 0 ? <span className="text-ink-400">There isn’t anything to compare. <b>{base}</b> is up to date with all commits from <b>{head}</b>.</span> : <span>✓ Able to merge · <b>{commits.length}</b> commit{commits.length === 1 ? '' : 's'} · <b>{changed.length}</b> file{changed.length === 1 ? '' : 's'} changed</span>}</div>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="mb-2 w-full rounded-md border border-[#d0d7de] px-3 py-2 font-semibold" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Leave a comment. Tip: write “Fixes #12” to link an issue." className="mb-3 h-28 w-full rounded-md border border-[#d0d7de] px-3 py-2" />
        <div className="flex gap-2"><button disabled={!title.trim() || commits.length === 0} onClick={() => { const t = title, b = body, hRepo = headRepo, hB = head, bB = base; if (act((w) => { openPR(w, baseRepoKey, { title: t, body: b, headRepo: hRepo, headBranch: hB, base: bB }) })) go({ page: 'pr', key: baseRepoKey, number: w.hub.repos[baseRepoKey].prs[0].number }) }} className="btn-green disabled:opacity-50">Create pull request</button><button className="btn-ghost" onClick={() => go({ page: 'repo', key, tab: 'prs' })}>Cancel</button></div>
        {commits.length > 0 && <div className="mt-5"><h3 className="mb-2 font-semibold">Commits</h3><CommitList w={w} hashes={[...commits].reverse()} /></div>}
      </div>
    </div>
  )
}

function DiffView({ w, path, a, b }: { w: World; path: string; a?: string; b?: string }) {
  void w
  const lines = unifiedDiff(path, a, b)
  const add = lines.filter((l) => l.kind === 'add').length, del = lines.filter((l) => l.kind === 'del').length
  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
      <div className="flex items-center gap-2 border-b border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5 font-mono text-[12px]"><span className="font-semibold">{path}</span><span className="text-[#1f883d]">+{add}</span><span className="text-[#cf222e]">−{del}</span></div>
      <pre className="overflow-auto font-mono text-[12px] leading-[1.6]">{lines.filter((l) => l.kind !== 'meta').map((l, i) => <div key={i} className={`px-3 ${l.kind === 'add' ? 'bg-[#dafbe1]' : l.kind === 'del' ? 'bg-[#ffebe9]' : l.kind === 'hunk' ? 'bg-[#ddf4ff] text-ink-400' : ''}`}>{l.text || ' '}</div>)}</pre>
    </div>
  )
}

function PRPage({ w, hub, number, tab, go, act }: { w: World; hub: HubRepo; number: number; tab: NonNullable<Extract<HubRoute, { page: 'pr' }>['tab']>; go: (r: HubRoute) => void; act: (fn: (w: World) => void) => boolean }) {
  const key = hubKey(hub)
  const pr = hub.prs.find((p) => p.number === number)
  const [method, setMethod] = useState<'merge' | 'squash' | 'rebase'>('merge')
  const [comment, setComment] = useState('')
  const [confirm, setConfirm] = useState(false)
  if (!pr) return <div className="p-6">PR not found.</div>
  const st = prState(w, hub, pr)
  const headRepo = w.hub.repos[pr.head.repo]
  const headBranchExists = !!headRepo?.repo.refs['refs/heads/' + pr.head.branch]
  const write = canWrite(w, hub)
  const timeline = [...pr.comments.map((c) => ({ ...c, kind: 'comment' as const })), ...pr.reviews.map((r) => ({ author: r.author, body: r.body, time: r.time, kind: r.state }))].sort((a, b) => a.time - b.time)
  const tabBtn = (id: typeof tab, label: string, n?: number) => <button key={id} onClick={() => go({ page: 'pr', key, number, tab: id })} className={`border-b-2 px-3 py-2 ${tab === id ? 'border-[#fd8c73] font-semibold' : 'border-transparent'}`}>{label}{n !== undefined && <span className="ml-1 rounded-full bg-ink-100 px-1.5 text-[11px]">{n}</span>}</button>
  return (
    <div>
      <RepoHeader w={w} hub={hub} tab="prs" go={go} act={act} />
      <div className="mx-auto max-w-4xl p-5">
        <h2 className="text-xl font-semibold">{pr.title} <span className="font-normal text-ink-400">#{pr.number}</span></h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-ink-600"><StateBadge state={pr.state} /><span><b>{pr.author}</b> {pr.state === 'merged' ? `merged ${st.commits.length} commit${st.commits.length === 1 ? '' : 's'} into` : 'wants to merge ' + st.commits.length + ' commit' + (st.commits.length === 1 ? '' : 's') + ' into'} <code className="rounded bg-[#ddf4ff] px-1 text-[#0969da]">{pr.base}</code> from <code className="rounded bg-[#ddf4ff] px-1 text-[#0969da]">{pr.head.repo === key ? '' : pr.head.repo.split('/')[0] + ':'}{pr.head.branch}</code></span></div>
        <div className="mt-3 flex border-b border-[#d0d7de]">{tabBtn('conversation', 'Conversation', timeline.length)}{tabBtn('commits', 'Commits', st.commits.length)}{tabBtn('files', 'Files changed', st.changed.length)}{tabBtn('checks', 'Checks')}</div>
        {tab === 'conversation' && (
          <div className="mt-4">
            <div className="rounded-lg border border-[#d0d7de] bg-white"><div className="flex items-center gap-2 border-b border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5"><span>{avatar(w, pr.author)}</span><b>{pr.author}</b><span className="text-ink-400">commented {ago(w, pr.createdAt)}</span></div><div className="p-3">{pr.body ? <Article md={pr.body} className="text-[14px]" /> : <span className="italic text-ink-400">No description provided.</span>}</div></div>
            {timeline.map((t, i) => (
              <div key={i} className={`mt-3 rounded-lg border bg-white ${t.kind === 'approved' ? 'border-[#1f883d]' : t.kind === 'changes_requested' ? 'border-[#cf222e]' : 'border-[#d0d7de]'}`}>
                <div className="flex items-center gap-2 border-b border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5"><span>{avatar(w, t.author)}</span><b>{t.author}</b><span className="text-ink-400">{t.kind === 'approved' ? '✅ approved these changes' : t.kind === 'changes_requested' ? '🔴 requested changes' : t.kind === 'commented' ? 'reviewed' : 'commented'} {ago(w, t.time)}</span></div>
                <div className="p-3"><Article md={t.body} className="text-[14px]" /></div>
              </div>))}
            <div className="mt-4 rounded-lg border border-[#d0d7de] bg-white p-3">
              {pr.state === 'merged' ? (
                <div><div className="flex items-center gap-2 text-[#8250df]"><span className="text-xl">⇄</span><b>Pull request successfully merged and closed</b></div><div className="mt-1 text-ink-400">{pr.mergedAs === 'merge' ? 'Merge commit' : pr.mergedAs === 'squash' ? 'Squashed and merged' : 'Rebased and merged'} as {pr.mergeCommit && <code>{short(pr.mergeCommit)}</code>} into <b>{pr.base}</b>.</div>
                  {headBranchExists && pr.head.repo === key && pr.head.branch !== hub.defaultBranch && write && <button onClick={() => act((w) => { delete w.hub.repos[key].repo.refs['refs/heads/' + pr.head.branch] })} className="mt-3 rounded-md border border-[#d0d7de] px-3 py-1 font-semibold hover:bg-[#f6f8fa]">Delete branch</button>}
                  {!headBranchExists && <div className="mt-2 text-ink-400">The <code>{pr.head.branch}</code> branch has been deleted.</div>}</div>
              ) : pr.state === 'closed' ? <div className="text-ink-600">This pull request is closed.</div> : (
                <div>
                  {st.checks.configured && <div className="mb-3 border-b border-[#d0d7de] pb-3"><Checks w={w} hub={hub} hash={st.headHash!} /></div>}
                  {pr.reviews.length > 0 && <div className="mb-3 border-b border-[#d0d7de] pb-3">{pr.reviews.at(-1)!.state === 'approved' ? <span className="text-[#1f883d]">✓ Changes approved by {pr.reviews.at(-1)!.author}</span> : pr.reviews.at(-1)!.state === 'changes_requested' ? <span className="text-[#cf222e]">● {pr.reviews.at(-1)!.author} requested changes</span> : <span>{pr.reviews.at(-1)!.author} left review comments</span>}</div>}
                  {st.mergeable ? (
                    <div className="flex items-center gap-2 text-[#1f883d]"><span className="text-xl">✓</span><div><b>This branch has no conflicts with the base branch</b><div className="font-normal text-ink-400">Merging can be performed automatically.</div></div></div>
                  ) : <div className="flex items-center gap-2 text-[#cf222e]"><span className="text-xl">✕</span><div><b>{st.blocked}</b>{st.conflicts.length > 0 && <div className="font-normal text-ink-400">Conflicting files: {st.conflicts.join(', ')}. Update your branch locally (merge or rebase <code>{pr.base}</code> into it), resolve, and push.</div>}</div></div>}
                  {write ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {!confirm ? <button disabled={!st.mergeable} onClick={() => setConfirm(true)} className="btn-green disabled:opacity-50">{method === 'merge' ? 'Merge pull request' : method === 'squash' ? 'Squash and merge' : 'Rebase and merge'}</button>
                        : <><button onClick={() => { const m = method; if (act((w) => { mergePR(w, w.hub.repos[key], number, m) })) setConfirm(false) }} className="btn-green">Confirm {method === 'merge' ? 'merge' : method === 'squash' ? 'squash and merge' : 'rebase and merge'}</button><button className="btn-ghost" onClick={() => setConfirm(false)}>Cancel</button></>}
                      <select value={method} onChange={(e) => setMethod(e.target.value as typeof method)} className="rounded-md border border-[#d0d7de] bg-white px-2 py-1.5"><option value="merge">Create a merge commit</option><option value="squash">Squash and merge</option><option value="rebase">Rebase and merge</option></select>
                      <span className="text-ink-400">{method === 'merge' ? 'All commits from this branch will be added to the base branch via a merge commit.' : method === 'squash' ? `The ${st.commits.length} commits will be combined into one commit in the base branch.` : `The ${st.commits.length} commits will be rebased and added to the base branch.`}</span>
                    </div>
                  ) : <div className="mt-3 text-ink-400">Only people with write access to <b>{key}</b> can merge pull requests.</div>}
                </div>)}
            </div>
            <div className="mt-4 rounded-lg border border-[#d0d7de] bg-white p-3">
              <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Leave a comment" className="h-20 w-full rounded-md border border-[#d0d7de] px-3 py-2" />
              <div className="mt-2 flex justify-end gap-2">{pr.state === 'open' && write && <button className="btn-ghost border border-[#d0d7de]" onClick={() => act((w) => closePR(w, w.hub.repos[key], number))}>Close pull request</button>}<button disabled={!comment.trim()} className="btn-green disabled:opacity-50" onClick={() => { const c = comment; if (act((w) => commentPR(w, w.hub.repos[key], number, c))) setComment('') }}>Comment</button></div>
            </div>
          </div>
        )}
        {tab === 'commits' && <div className="mt-4"><CommitList w={w} hashes={[...st.commits].reverse()} /></div>}
        {tab === 'files' && <div className="mt-4">{st.changed.length === 0 && <div className="text-ink-400">No changes.</div>}{st.changed.map((c) => <DiffView key={c.path} w={w} path={c.path} a={c.a} b={c.b} />)}</div>}
        {tab === 'checks' && <div className="mt-4 rounded-lg border border-[#d0d7de] bg-white p-4">{st.headHash ? <><Checks w={w} hub={hub} hash={st.headHash} /><pre className="mt-3 rounded-md bg-ink-950 p-3 font-mono text-[12px] text-ink-100">{st.checks.log.join('\n')}</pre></> : 'No head commit.'}</div>}
      </div>
    </div>
  )
}

function IssuesTab({ w, hub, go }: { w: World; hub: HubRepo; go: (r: HubRoute) => void }) {
  const [filter, setFilter] = useState<'open' | 'closed'>('open')
  const key = hubKey(hub)
  const list = hub.issues.filter((i) => i.state === filter)
  return (
    <div>
      <div className="mb-3 flex items-center gap-3"><button onClick={() => setFilter('open')} className={filter === 'open' ? 'font-semibold' : 'text-ink-400'}>⊙ {hub.issues.filter((i) => i.state === 'open').length} Open</button><button onClick={() => setFilter('closed')} className={filter === 'closed' ? 'font-semibold' : 'text-ink-400'}>✓ {hub.issues.filter((i) => i.state === 'closed').length} Closed</button><button onClick={() => go({ page: 'new-issue', key })} className="btn-green ml-auto py-1.5 text-[12px]">New issue</button></div>
      <div className="overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
        {list.length === 0 && <div className="p-8 text-center text-ink-400">No {filter} issues.</div>}
        {list.map((i) => <button key={i.number} onClick={() => go({ page: 'issue', key, number: i.number })} className="flex w-full items-start gap-3 border-b border-[#eaeef2] px-3 py-2 text-left last:border-0 hover:bg-[#f6f8fa]"><span className={i.state === 'open' ? 'text-[#1f883d]' : 'text-[#8250df]'}>{i.state === 'open' ? '⊙' : '✓'}</span><div><div className="font-semibold">{i.title} <span className="font-normal text-ink-400">#{i.number}</span> {i.labels.map((l) => <span key={l} className="pill ml-1 bg-sun-100 text-sun-500">{l}</span>)}</div><div className="text-ink-400">opened {ago(w, i.createdAt)} by {i.author}{i.closedBy && ` · closed by #${i.closedBy}`}</div></div></button>)}
      </div>
    </div>
  )
}
function NewIssue({ w, hub, go, act }: { w: World; hub: HubRepo; go: (r: HubRoute) => void; act: (fn: (w: World) => void) => boolean }) {
  const [title, setTitle] = useState(''); const [body, setBody] = useState('')
  const key = hubKey(hub)
  return (
    <div><RepoHeader w={w} hub={hub} tab="issues" go={go} act={act} /><div className="mx-auto max-w-3xl p-5">
      <h2 className="mb-3 text-xl font-semibold">New issue</h2>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" className="mb-2 w-full rounded-md border border-[#d0d7de] px-3 py-2 font-semibold" />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Describe the problem" className="mb-3 h-28 w-full rounded-md border border-[#d0d7de] px-3 py-2" />
      <button disabled={!title.trim()} className="btn-green disabled:opacity-50" onClick={() => { const t = title, b = body; if (act((w) => { createIssue(w, w.hub.repos[key], { title: t, body: b }) })) go({ page: 'issue', key, number: w.hub.repos[key].issues[0].number }) }}>Submit new issue</button>
    </div></div>
  )
}
function IssuePage({ w, hub, number, go, act }: { w: World; hub: HubRepo; number: number; go: (r: HubRoute) => void; act: (fn: (w: World) => void) => boolean }) {
  const [comment, setComment] = useState('')
  const key = hubKey(hub)
  const is = hub.issues.find((i) => i.number === number)
  if (!is) return <div className="p-6">Issue not found.</div>
  const closer = is.closedBy ? hub.prs.find((p) => p.number === is.closedBy) : null
  return (
    <div><RepoHeader w={w} hub={hub} tab="issues" go={go} act={act} /><div className="mx-auto max-w-3xl p-5">
      <h2 className="text-xl font-semibold">{is.title} <span className="font-normal text-ink-400">#{is.number}</span></h2>
      <div className="mt-1 flex items-center gap-2 text-ink-600"><StateBadge state={is.state} /><span><b>{is.author}</b> opened this issue {ago(w, is.createdAt)}</span></div>
      <div className="mt-4 rounded-lg border border-[#d0d7de] bg-white"><div className="flex items-center gap-2 border-b border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5"><span>{avatar(w, is.author)}</span><b>{is.author}</b></div><div className="p-3">{is.body ? <Article md={is.body} className="text-[14px]" /> : <span className="italic text-ink-400">No description provided.</span>}</div></div>
      {is.comments.map((c, i) => <div key={i} className="mt-3 rounded-lg border border-[#d0d7de] bg-white"><div className="flex items-center gap-2 border-b border-[#d0d7de] bg-[#f6f8fa] px-3 py-1.5"><span>{avatar(w, c.author)}</span><b>{c.author}</b><span className="text-ink-400">{ago(w, c.time)}</span></div><div className="p-3"><Article md={c.body} className="text-[14px]" /></div></div>)}
      {closer && <div className="mt-3 flex items-center gap-2 text-ink-600"><span className="text-[#8250df]">⇄</span> Closed via pull request <button className="text-[#0969da]" onClick={() => go({ page: 'pr', key, number: closer.number })}>#{closer.number}</button></div>}
      <div className="mt-4 rounded-lg border border-[#d0d7de] bg-white p-3">
        <textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Leave a comment" className="h-20 w-full rounded-md border border-[#d0d7de] px-3 py-2" />
        <div className="mt-2 flex justify-end gap-2"><button className="btn-ghost border border-[#d0d7de]" onClick={() => act((w) => closeIssue(w, w.hub.repos[key], number, is.state === 'closed'))}>{is.state === 'open' ? 'Close issue' : 'Reopen issue'}</button><button disabled={!comment.trim()} className="btn-green disabled:opacity-50" onClick={() => { const c = comment; if (act((w) => commentIssue(w, w.hub.repos[key], number, c))) setComment('') }}>Comment</button></div>
      </div>
    </div></div>
  )
}

function ActionsTab({ w, hub }: { w: World; hub: HubRepo }) {
  if (!hub.ci) return <div className="rounded-lg border border-[#d0d7de] bg-white p-8 text-center text-ink-400">Get started with GitHub Actions — no workflows are configured for this repository.</div>
  return (
    <div className="overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
      <div className="border-b border-[#d0d7de] bg-[#f6f8fa] px-3 py-2 font-semibold">ci — latest run per branch</div>
      {hubBranches(w, hub).map((b) => { const r = runCI(w, hub, b.hash); return <div key={b.name} className="border-b border-[#eaeef2] px-3 py-2 last:border-0"><div className="flex items-center gap-2"><span className={r.ok ? 'text-[#1f883d]' : 'text-[#cf222e]'}>{r.ok ? '✓' : '✕'}</span><b>{subject(w.commit(b.hash).message)}</b><span className="font-mono text-ink-400">{b.name} · {short(b.hash)}</span></div><pre className="mt-1 font-mono text-[11px] text-ink-600">{r.log.join('\n')}</pre></div> })}
    </div>
  )
}
function SettingsTab({ w, hub }: { w: World; hub: HubRepo }) {
  return (
    <div className="grid gap-4">
      <div className="rounded-lg border border-[#d0d7de] bg-white p-4"><h3 className="mb-2 font-semibold">Collaborators</h3><div className="flex flex-wrap gap-2">{[hub.owner, ...(hub.collaborators ?? [])].map((h) => <span key={h} className="rounded-md border border-[#d0d7de] px-2 py-1">{avatar(w, h)} {h}{h === hub.owner && <span className="ml-1 text-ink-400">(owner)</span>}</span>)}</div></div>
      <div className="rounded-lg border border-[#d0d7de] bg-white p-4"><h3 className="mb-2 font-semibold">Branch protection rules</h3>{hub.protection ? <div><div className="font-mono">🛡 {hub.protection.branch}</div><ul className="mt-1 list-disc pl-5 text-ink-600">{hub.protection.requirePR && <li>Require a pull request before merging (no direct pushes)</li>}{hub.protection.requireChecks && <li>Require status checks to pass before merging (<code>ci</code>)</li>}<li>Block force pushes</li></ul></div> : <div className="text-ink-400">No rules. Anyone with write access can push to any branch.</div>}</div>
      <div className="rounded-lg border border-[#d0d7de] bg-white p-4"><h3 className="mb-2 font-semibold">CI workflow</h3>{hub.ci ? <div className="text-ink-600">A workflow named <code>ci</code> runs on every push and pull request.</div> : <div className="text-ink-400">None configured.</div>}</div>
    </div>
  )
}

