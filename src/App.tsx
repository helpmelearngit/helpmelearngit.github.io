import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom'
import { LandingPage } from './pages/Landing'
import { CurriculumPage } from './pages/Curriculum'
import { LessonPage } from './pages/Lesson'
import { ProfilePage } from './pages/Profile'
import { useProgress } from './store/progress'

function Nav() {
  const prog = useProgress()
  return (
    <header className="sticky top-0 z-20 h-14 border-b border-ink-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-full max-w-6xl items-center gap-6 px-6">
        <Link to="/" className="flex items-center gap-2 font-extrabold tracking-tight"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-ember-500 font-mono text-sm text-white">⎇</span>helpmelearngit</Link>
        <nav className="flex items-center gap-4 text-sm">
          <NavLink to="/learn" className={({ isActive }) => (isActive ? 'font-semibold text-ink-950' : 'text-ink-600 hover:text-ink-950')}>Curriculum</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          {prog.profile ? <NavLink to="/profile" className="flex items-center gap-2 rounded-full bg-ink-100 px-3 py-1 hover:bg-ink-200"><span>🧑‍🍳</span><span className="font-semibold">{prog.profile.handle}</span></NavLink> : <NavLink to="/profile?new=1" className="btn-dark py-1.5">Create profile</NavLink>}
        </div>
      </div>
    </header>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/learn" element={<CurriculumPage />} />
        <Route path="/learn/:id" element={<LessonPage />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="*" element={<LandingPage />} />
      </Routes>
    </BrowserRouter>
  )
}
