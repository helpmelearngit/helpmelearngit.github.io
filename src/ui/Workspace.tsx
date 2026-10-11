import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Session } from './session'
import { Terminal } from './Terminal'
import { Editor } from './Editor'
import { Graph } from './Graph'
import { Hub } from './Hub'
import { Article } from './Article'
import { useWorld } from '../store/world'
import { nextLesson } from '../lessons'

export function Workspace({ session, onReset }: { session: Session; onReset: () => void }) {
  useWorld(session.world)
  const lesson = session.lesson
  const panes = { editor: lesson.panes?.editor !== false, graph: lesson.panes?.graph !== false, hub: lesson.panes?.hub === true }
  const tab = panes.hub && (session.rightTab === 'hub' || !panes.editor) ? 'hub' : 'editor'
  return (
    <div className="grid h-full min-h-0 grid-cols-[320px_1fr] gap-2 bg-ink-100 p-2 max-lg:grid-cols-1 max-lg:overflow-auto">
      <div className="hidden rounded-xl border border-sun-500/40 bg-sun-100 px-3 py-2 text-sm text-ink-800 max-lg:block">The workspace is designed for a laptop-sized screen. On a phone, read the articles and come back on a bigger screen to practice.</div>
      <div className="flex min-h-0 flex-col gap-2">
        <TaskPanel session={session} onReset={onReset} />
        {panes.graph && <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm"><div className="border-b border-ink-200 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-ink-400">Commit graph</div><div className="min-h-0 flex-1"><Graph session={session} /></div></div>}
      </div>
      <div className="grid min-h-0 grid-rows-[minmax(0,55fr)_minmax(0,45fr)] gap-2">
        <div className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-ink-200 shadow-sm">
          {(panes.hub && panes.editor) && (
            <div className="flex shrink-0 gap-1 border-b border-ink-800 bg-ink-950 px-2 pt-1.5 text-[12px]">
              <button onClick={() => session.setTab('editor')} className={`rounded-t-md px-3 py-1.5 ${tab === 'editor' ? 'bg-ink-900 text-white' : 'text-ink-400 hover:text-ink-200'}`}>Editor</button>
              <button onClick={() => session.setTab('hub')} className={`rounded-t-md px-3 py-1.5 ${tab === 'hub' ? 'bg-[#f6f8fa] text-ink-900' : 'text-ink-400 hover:text-ink-200'}`}>🐙 GitHub</button>
            </div>)}
          <div className="min-h-0 flex-1">{tab === 'hub' ? <Hub session={session} /> : <Editor session={session} />}</div>
        </div>
        <div className="min-h-0 overflow-hidden rounded-xl border border-ink-200 shadow-sm"><Terminal session={session} /></div>
      </div>
    </div>
  )
}

function TaskPanel({ session, onReset }: { session: Session; onReset: () => void }) {
  const [hint, setHint] = useState<number | null>(null)
  const lesson = session.lesson
  const next = nextLesson(lesson.id)
  const done = session.taskIndex
  return (
    <div className="shrink-0 rounded-xl border border-ink-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-400">Tasks · {done}/{lesson.tasks.length}</div>
        <button onClick={onReset} className="text-[11px] text-ink-400 hover:text-ember-500" title="Rebuild the starting state">↺ reset</button>
      </div>
      <div className="h-1 bg-ink-100"><div className="h-1 bg-leaf-500 transition-all" style={{ width: `${(done / lesson.tasks.length) * 100}%` }} /></div>
      <ol className="max-h-[42vh] overflow-auto p-2">
        {lesson.tasks.map((t, i) => {
          const state = i < done ? 'done' : i === done ? 'current' : 'todo'
          return (
            <li key={i} className={`mb-1 rounded-lg px-2.5 py-2 text-[13px] leading-snug ${state === 'current' ? 'bg-sun-100 ring-1 ring-sun-500/40' : state === 'done' ? 'text-ink-400' : 'text-ink-300'}`}>
              <div className="flex gap-2">
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${state === 'done' ? 'bg-leaf-500 text-white' : state === 'current' ? 'bg-sun-500 text-white' : 'bg-ink-100 text-ink-400'}`}>{state === 'done' ? '✓' : i + 1}</span>
                <div className="min-w-0 flex-1">
                  <Article md={t.text} className={`!text-[13px] !leading-snug ${state === 'done' ? 'line-through decoration-ink-300' : ''}`} />
                  {state === 'current' && t.hint && <button onClick={() => setHint(hint === i ? null : i)} className="mt-1 text-[11px] font-semibold text-sky-500">{hint === i ? 'hide hint' : 'need a hint?'}</button>}
                  {state === 'current' && hint === i && t.hint && <div className="mt-1 rounded-md bg-white px-2 py-1.5 text-[12px] text-ink-700 shadow-inner"><Article md={t.hint} className="!text-[12px] !leading-snug" /></div>}
                </div>
              </div>
            </li>)
        })}
      </ol>
      {session.completed && (
        <div className="border-t border-leaf-500/30 bg-leaf-100 p-3">
          <div className="mb-1 text-sm font-bold text-leaf-500">Lesson complete 🎉</div>
          <ul className="mb-2 list-disc pl-4 text-[12.5px] text-ink-800">{lesson.takeaways.map((t) => <li key={t}><Article md={t} className="!text-[12.5px] !leading-snug" /></li>)}</ul>
          {next ? <Link to={`/learn/${next.id}`} className="btn-primary w-full justify-center">Next: {next.title} →</Link> : <Link to="/learn" className="btn-primary w-full justify-center">Back to curriculum</Link>}
        </div>)}
    </div>
  )
}
