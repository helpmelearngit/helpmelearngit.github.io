import { Link } from 'react-router-dom'
import { modules, lessons } from '../lessons'
import { useProgress } from '../store/progress'

export function LandingPage() {
  const prog = useProgress()
  const next = lessons.find((l) => !prog.done[l.id]) ?? lessons[0]
  const started = Object.keys(prog.done).length > 0 || Object.keys(prog.tasks).length > 0
  return (
    <div>
      <section className="relative overflow-hidden bg-ink-950 text-white">
        <div className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'radial-gradient(60% 50% at 20% 10%, #f0513355, transparent), radial-gradient(50% 40% at 85% 30%, #2f80ed44, transparent)' }} />
        <div className="relative mx-auto max-w-5xl px-6 pb-24 pt-24">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-sm text-ink-200">Free · no install · progress saved in your browser</div>
          <h1 className="max-w-3xl text-6xl font-extrabold leading-[1.05] tracking-tight">Learn Git by <span className="text-ember-400">doing</span>, in your browser.</h1>
          <p className="mt-6 max-w-2xl text-xl leading-relaxed text-ink-300">A linear course of {lessons.length} hands-on lessons. Each one explains a concept in plain words, then drops you into a simulated terminal, code editor and a mini GitHub to practice it. No real repository can be harmed.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to={started ? `/learn/${next.id}` : prog.profile ? `/learn/${next.id}` : '/profile?new=1'} className="btn-primary px-6 py-3 text-base">{started ? `Continue: ${next.title} →` : 'Start learning →'}</Link>
            <Link to="/learn" className="btn px-6 py-3 text-base text-white ring-1 ring-white/20 hover:bg-white/10">Browse the curriculum</Link>
          </div>
          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {[['⌨️', 'A real-feeling terminal', 'Type git commands exactly as you would on your machine. Errors, hints and output match modern git.'], ['📝', 'Built-in editor', 'Edit files, resolve conflict markers and write commit messages in a small VS Code-style editor.'], ['🐙', 'Mini GitHub', 'Push, open pull requests, get reviews from a simulated teammate, merge, link issues, pass CI checks, fork.']].map(([i, t, d]) => (
              <div key={t} className="rounded-2xl border border-white/10 bg-white/5 p-5"><div className="text-2xl">{i}</div><div className="mt-2 font-semibold">{t}</div><div className="mt-1 text-sm text-ink-300">{d}</div></div>))}
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-3xl font-bold tracking-tight">Why linear?</h2>
        <p className="mt-3 max-w-2xl text-lg text-ink-600">Most Git tutorials are a pile of commands. Here every lesson answers a problem the previous one created: you make a mess, so you learn to undo; you work on two things at once, so you learn branches; you have a teammate, so you learn remotes and pull requests. By the end, each command has a reason.</p>
        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {modules.map((m, i) => (
            <Link key={m.id} to={`/learn/${m.lessons[0].id}`} className="group rounded-2xl border border-ink-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center gap-2 text-sm text-ink-400"><span className="font-mono">Module {i}</span>{m.optional && <span className="pill bg-ink-100 text-ink-600">optional</span>}<span className="ml-auto">{m.lessons.length} lessons</span></div>
              <div className="mt-1 text-xl font-bold group-hover:text-ember-500">{m.title}</div>
              <div className="mt-1 text-ink-600">{m.blurb}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">{m.lessons.map((l) => <span key={l.id} className={`pill ${prog.done[l.id] ? 'bg-leaf-100 text-leaf-500' : 'bg-ink-100 text-ink-600'}`}>{l.title}</span>)}</div>
            </Link>))}
        </div>
      </section>
      <footer className="border-t border-ink-200 py-10 text-center text-sm text-ink-400">Open source · <a className="underline" href="https://github.com/helpmelearngit/helpmelearngit.github.io">contribute a lesson</a></footer>
    </div>
  )
}
