import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { findLesson, moduleOf, nextLesson, prevLesson, lessonNumber, lessons } from '../lessons'
import { Session } from '../ui/session'
import { Workspace } from '../ui/Workspace'
import { Article } from '../ui/Article'
import { progress, useProgress } from '../store/progress'

export function LessonPage() {
  const { id = '' } = useParams()
  const lesson = findLesson(id)
  const nav = useNavigate()
  useEffect(() => { if (!lesson) nav('/learn') }, [lesson, nav])
  if (!lesson) return null
  return <LessonView key={lesson.id} lesson={lesson} />
}

function LessonView({ lesson }: { lesson: NonNullable<ReturnType<typeof findLesson>> }) {
  const prog = useProgress()
  const [view, setView] = useState<'read' | 'practice'>('read')
  const handle = prog.profile?.handle ?? 'you'
  const name = prog.profile?.name ?? 'You'
  const [session, setSession] = useState(() => new Session(lesson, handle, name))
  useEffect(() => { progress.visit(lesson.id); window.scrollTo(0, 0) }, [lesson])
  const mod = moduleOf(lesson)
  const next = nextLesson(lesson.id), prev = prevLesson(lesson.id)
  const n = lessonNumber(lesson.id)
  const done = !!prog.done[lesson.id]

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col">
      <div className="flex shrink-0 items-center gap-3 border-b border-ink-200 bg-white px-4 py-2">
        <Link to="/learn" className="text-sm text-ink-400 hover:text-ink-900">← Curriculum</Link>
        <span className="text-ink-300">/</span>
        <span className="text-sm text-ink-400">{mod.title}</span>
        <span className="text-ink-300">/</span>
        <span className="text-sm font-semibold">{n}. {lesson.title}</span>
        {done && <span className="pill bg-leaf-100 text-leaf-500">completed</span>}
        <div className="ml-auto flex items-center gap-1 rounded-lg bg-ink-100 p-1 text-sm">
          <button onClick={() => setView('read')} className={`rounded-md px-3 py-1 ${view === 'read' ? 'bg-white font-semibold shadow-sm' : 'text-ink-600'}`}>📖 Read</button>
          <button onClick={() => setView('practice')} className={`rounded-md px-3 py-1 ${view === 'practice' ? 'bg-white font-semibold shadow-sm' : 'text-ink-600'}`}>⌨️ Practice{session.completed ? ' ✓' : ''}</button>
        </div>
      </div>
      {view === 'read' ? (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="border-b border-ink-200 bg-gradient-to-b from-white to-ink-50">
            <div className="mx-auto max-w-3xl px-6 pb-12 pt-14">
              <div className="mb-3 text-sm font-semibold uppercase tracking-wider text-ember-500">{mod.title} · lesson {n} of {lessons.length}</div>
              <h1 className="text-5xl font-extrabold tracking-tight text-ink-950">{lesson.title}</h1>
              <p className="mt-4 text-xl leading-relaxed text-ink-600">{lesson.tagline}</p>
              <div className="mt-6 flex items-center gap-4 text-sm text-ink-400"><span>⏱ about {lesson.minutes} min</span><span>·</span><span>{lesson.tasks.length} hands-on tasks</span></div>
            </div>
          </div>
          <div className="mx-auto max-w-3xl px-6 py-10"><Article md={lesson.article} /></div>
          <div className="mx-auto max-w-3xl px-6 pb-20">
            <div className="rounded-2xl bg-ink-950 p-8 text-white shadow-xl">
              <div className="text-sm font-semibold uppercase tracking-wider text-ember-400">Now practice</div>
              <h3 className="mt-2 text-2xl font-bold">{lesson.tasks.length} tasks in the simulated terminal</h3>
              <ol className="mt-4 space-y-1.5 text-ink-200">{lesson.tasks.map((t, i) => <li key={i} className="flex gap-2"><span className="text-ink-400">{i + 1}.</span><Article md={t.text} className="!text-[15px] !leading-snug !text-ink-200" /></li>)}</ol>
              <button onClick={() => setView('practice')} className="btn-primary mt-6 text-base">Open the workspace →</button>
            </div>
            <div className="mt-8 flex justify-between text-sm">
              {prev ? <Link to={`/learn/${prev.id}`} className="text-ink-400 hover:text-ink-900">← {prev.title}</Link> : <span />}
              {next && <Link to={`/learn/${next.id}`} className="text-ink-400 hover:text-ink-900">{next.title} →</Link>}
            </div>
          </div>
        </div>
      ) : <div className="min-h-0 flex-1"><Workspace session={session} onReset={() => setSession(new Session(lesson, handle, name))} /></div>}
    </div>
  )
}
