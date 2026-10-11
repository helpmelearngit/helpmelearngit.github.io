// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, within, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { LessonPage } from '../pages/Lesson'
import { CurriculumPage } from '../pages/Curriculum'
import { LandingPage } from '../pages/Landing'
import { Hub } from './Hub'
import { Session } from './session'
import type { Lesson } from '../lessons/types'
import { Article } from './Article'
import { lessons } from '../lessons'

// CodeMirror needs layout APIs jsdom lacks; the editor is exercised manually in the browser.
vi.mock('./Editor', () => ({ Editor: () => <div data-testid="editor-stub" /> }))
afterEach(cleanup)

const at = (path: string) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/learn" element={<CurriculumPage />} />
      <Route path="/learn/:id" element={<LessonPage />} />
    </Routes>
  </MemoryRouter>,
)

describe('pages', () => {
  it('landing renders', () => {
    at('/')
    expect(screen.getByText(/Learn Git by/)).toBeTruthy()
  })
  it('curriculum renders', () => {
    at('/learn')
    expect(screen.getAllByText(/Your first repository/).length).toBeGreaterThan(0)
  })

  it('lesson: article then practice; terminal drives task progress', () => {
    at('/learn/basics-three-areas')
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(/Working tree/)
    fireEvent.click(screen.getByText(/Practice/))
    const input = screen.getByLabelText('terminal input') as HTMLInputElement
    const type = (cmd: string) => { fireEvent.change(input, { target: { value: cmd } }); fireEvent.keyDown(input, { key: 'Enter' }) }
    type('git status')
    expect(screen.getByText(/Untracked files:/)).toBeTruthy()
    expect(screen.getByText(/Tasks · 1\/6/)).toBeTruthy()
    type('git add README.md')
    type('git status')
    type('git commit -m "Add project README"')
    expect(screen.getByText(/Tasks · 4\/6/)).toBeTruthy()
    expect(screen.getByText(/\[main \(root-commit\)/)).toBeTruthy()
    type('git add menu.md hours.txt')
    type('git commit -m "Add menu and opening hours"')
    type('git status')
    expect(screen.getByText(/Lesson complete/)).toBeTruthy()
    expect(screen.getByText(/Next:/)).toBeTruthy()
    // graph shows commits
    expect(screen.getByText('Add project README', { selector: 'text' })).toBeTruthy()
  })

  it('terminal: errors, history, tab completion', () => {
    at('/learn/basics-why-git')
    fireEvent.click(screen.getByText(/Practice/))
    const input = screen.getByLabelText('terminal input') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'git status' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText(/not a git repository/)).toBeTruthy()
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(input.value).toBe('git status')
    fireEvent.change(input, { target: { value: 'cd sun' } })
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('cd sunrise-bakery/')
  })
})

describe('hub pane', () => {
  const lesson: Lesson = {
    id: 'x', title: 'x', tagline: '', minutes: 1, article: '', takeaways: [], solution: [], tasks: [{ text: 't', check: () => false }],
    setup: () => {}, panes: { hub: true },
  }
  it('create repo, see quick-setup, push, browse code, open and merge a PR', () => {
    const s = new Session(lesson, 'ada', 'Ada')
    const { rerender } = render(<Hub session={s} />)
    fireEvent.click(screen.getByRole('button', { name: 'New repository' }))
    fireEvent.change(screen.getByPlaceholderText('sunrise-bakery'), { target: { value: 'sunrise-bakery' } })
    fireEvent.click(screen.getByText('Create repository'))
    expect(screen.getByText(/push an existing repository/)).toBeTruthy()
    expect(screen.getAllByText(/https:\/\/github.com\/ada\/sunrise-bakery.git/).length).toBeGreaterThan(0)
    // push from the terminal side
    for (const c of ['mkdir p', 'cd p', 'git init', 'echo hi > README.md', 'git add .', 'git commit -m "first"', 'git remote add origin https://github.com/ada/sunrise-bakery.git', 'git push -u origin main', 'git switch -c feat', 'echo "# Hello" > README.md', 'git commit -am "shout"', 'git push -u origin feat']) s.run(c)
    rerender(<Hub session={s} />)
    expect(screen.getByText('README.md', { selector: 'span' })).toBeTruthy()
    expect(screen.getByText(/2 branches/)).toBeTruthy()
    fireEvent.click(screen.getByText('Pull requests'))
    fireEvent.click(screen.getByText('New pull request'))
    fireEvent.change(screen.getByPlaceholderText('Title'), { target: { value: 'Shout louder' } })
    fireEvent.click(screen.getByText('Create pull request'))
    expect(screen.getByText(/Shout louder/)).toBeTruthy()
    expect(screen.getByText(/no conflicts with the base branch/)).toBeTruthy()
    fireEvent.click(screen.getByText('Files changed', { exact: false }))
    expect(screen.getByText('+# Hello')).toBeTruthy()
    fireEvent.click(screen.getByText('Conversation', { exact: false }))
    fireEvent.click(screen.getByText('Merge pull request'))
    fireEvent.click(screen.getByText('Confirm merge'))
    expect(screen.getByText(/successfully merged/)).toBeTruthy()
    expect(s.world.hub.repos['ada/sunrise-bakery'].prs[0].state).toBe('merged')
    fireEvent.click(screen.getByText('Delete branch'))
    expect(within(document.body).queryByText('Delete branch')).toBeNull()
  })
})

describe('articles', () => {
  it('every lesson article renders and has a figure or table, a Why callout and an Up next', () => {
    for (const l of lessons) {
      const { container, unmount } = render(<Article md={l.article} />)
      const html = container.innerHTML
      expect(html.length, l.id).toBeGreaterThan(2000)
      expect(/class="figure"|<table/.test(html), `${l.id} has no figure/table`).toBe(true)
      expect(/<blockquote class="why"/.test(html), `${l.id} has no Why callout`).toBe(true)
      expect(/Up next|go next/i.test(html), `${l.id} has no Up next`).toBe(true)
      unmount()
    }
  })
})
