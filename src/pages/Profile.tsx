import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { progress, useProgress } from '../store/progress'
import { lessons, modules } from '../lessons'

export function ProfilePage() {
  const prog = useProgress()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [name, setName] = useState(prog.profile?.name ?? '')
  const [handle, setHandle] = useState(prog.profile?.handle ?? '')
  const [msg, setMsg] = useState<string | null>(null)
  const creating = !prog.profile || params.get('new')
  const done = lessons.filter((l) => prog.done[l.id]).length

  const save = () => {
    progress.createProfile(name, handle || name.toLowerCase().replace(/\s+/g, '-'))
    const next = lessons.find((l) => !prog.done[l.id]) ?? lessons[0]
    nav(`/learn/${next.id}`)
  }
  const doImport = (file: File) => { file.text().then((t) => { try { progress.import(t); setMsg('Progress imported.') } catch (e) { setMsg(e instanceof Error ? e.message : 'Import failed') } }) }
  const doExport = () => { const blob = new Blob([progress.export()], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'helpmelearngit-progress.json'; a.click() }

  return (
    <div className="mx-auto max-w-2xl px-6 py-14">
      <h1 className="text-4xl font-extrabold tracking-tight">{creating ? 'Create your profile' : 'Your profile'}</h1>
      <p className="mt-2 text-ink-600">Your profile lives in this browser only: there is no server and nothing is sent anywhere. Your handle becomes your username on the simulated GitHub. Export a file to move your progress to another device.</p>
      <div className="mt-8 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
        <label className="block"><span className="mb-1 block text-sm font-semibold">Display name</span><input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" className="w-full rounded-lg border border-ink-200 px-3 py-2" /></label>
        <label className="mt-4 block"><span className="mb-1 block text-sm font-semibold">GitHub-style handle</span><div className="flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2"><span className="text-ink-400">github.com/</span><input value={handle} onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} placeholder="ada" className="flex-1 outline-none" /></div></label>
        <button onClick={save} disabled={!name.trim()} className="btn-primary mt-5 disabled:opacity-50">{creating ? 'Create profile and start →' : 'Save'}</button>
      </div>
      {prog.profile && (
        <div className="mt-8 rounded-2xl border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold">Progress</h2>
          <div className="mt-2 text-ink-600">{done} of {lessons.length} lessons complete · member since {new Date(prog.profile.createdAt).toLocaleDateString()}</div>
          <div className="mt-4 grid gap-2">{modules.map((m) => { const d = m.lessons.filter((l) => prog.done[l.id]).length; return <div key={m.id} className="flex items-center gap-3 text-sm"><span className="w-56 truncate">{m.title}</span><div className="h-2 flex-1 rounded-full bg-ink-100"><div className="h-2 rounded-full bg-leaf-500" style={{ width: `${(d / m.lessons.length) * 100}%` }} /></div><span className="w-12 text-right text-ink-400">{d}/{m.lessons.length}</span></div> })}</div>
          <div className="mt-6 flex flex-wrap gap-2">
            <button onClick={doExport} className="btn-dark">Export progress</button>
            <label className="btn-ghost cursor-pointer ring-1 ring-ink-200">Import file<input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && doImport(e.target.files[0])} /></label>
            <button onClick={() => { if (confirm('Delete all progress in this browser?')) { progress.reset(); setName(''); setHandle('') } }} className="btn-ghost text-ember-500">Reset everything</button>
          </div>
          {msg && <div className="mt-3 text-sm text-ink-600">{msg}</div>}
          <div className="mt-4 text-sm"><Link to="/learn" className="text-sky-500 underline">Back to the curriculum →</Link></div>
        </div>)}
    </div>
  )
}
