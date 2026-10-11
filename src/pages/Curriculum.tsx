import { Link } from 'react-router-dom'
import { modules, lessons } from '../lessons'
import { useProgress } from '../store/progress'

export function CurriculumPage() {
  const prog = useProgress()
  const doneCount = lessons.filter((l) => prog.done[l.id]).length
  const next = lessons.find((l) => !prog.done[l.id] && !(prog.skipPrimer && modules[0].lessons.includes(l))) ?? lessons[0]
  return (
    <div className="mx-auto max-w-4xl px-6 py-12">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div><h1 className="text-4xl font-extrabold tracking-tight">Curriculum</h1><p className="mt-2 text-ink-600">{modules.length} modules · {lessons.length} lessons · each one builds on the last.</p></div>
        <div className="text-right"><div className="text-sm text-ink-400">{doneCount} of {lessons.length} complete</div><div className="mt-1 h-2 w-48 rounded-full bg-ink-200"><div className="h-2 rounded-full bg-leaf-500" style={{ width: `${(doneCount / lessons.length) * 100}%` }} /></div></div>
      </div>
      {modules.map((m, mi) => (
        <section key={m.id} className="mb-10">
          <div className="mb-3 flex items-baseline gap-3"><span className="font-mono text-sm text-ink-400">Module {mi}</span><h2 className="text-2xl font-bold">{m.title}</h2>{m.optional && <span className="pill bg-ink-100 text-ink-600">optional</span>}</div>
          <p className="mb-4 max-w-2xl text-ink-600">{m.blurb}</p>
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
            {m.lessons.map((l) => {
              const done = !!prog.done[l.id]
              const isNext = l.id === next.id
              const partial = !done && (prog.tasks[l.id] ?? 0) > 0
              return (
                <Link key={l.id} to={`/learn/${l.id}`} className={`flex items-center gap-4 border-b border-ink-100 px-5 py-4 last:border-0 hover:bg-ink-50 ${isNext ? 'bg-sun-100/50' : ''}`}>
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${done ? 'bg-leaf-500 text-white' : isNext ? 'bg-ember-500 text-white' : 'bg-ink-100 text-ink-600'}`}>{done ? '✓' : lessons.indexOf(l) + 1}</span>
                  <div className="min-w-0 flex-1"><div className="font-semibold">{l.title}</div><div className="truncate text-sm text-ink-600">{l.tagline}</div></div>
                  <div className="shrink-0 text-right text-xs text-ink-400">{partial && <div className="text-sun-500">{prog.tasks[l.id]}/{l.tasks.length} tasks</div>}<div>{l.minutes} min</div></div>
                  {isNext && <span className="pill bg-ember-500 text-white">up next</span>}
                </Link>)
            })}
          </div>
        </section>))}
    </div>
  )
}
