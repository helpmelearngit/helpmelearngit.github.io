import { World, type OutLine } from '../engine/world'
import { exec, prompt as promptInfo } from '../engine/shell'
import type { Lesson } from '../lessons/types'
import { progress } from '../store/progress'
import { repoAt } from '../engine/repo'
import { HOME, VFS } from '../engine/vfs'

export type TermEntry = { kind: 'cmd'; prompt: ReturnType<typeof promptInfo>; text: string } | { kind: 'out'; line: OutLine }

export type HubRoute =
  | { page: 'home' }
  | { page: 'new-repo' }
  | { page: 'repo'; key: string; tab: 'code' | 'commits' | 'branches' | 'prs' | 'issues' | 'actions' | 'settings'; ref?: string; path?: string }
  | { page: 'pr'; key: string; number: number; tab?: 'conversation' | 'commits' | 'files' | 'checks' }
  | { page: 'new-pr'; key: string; head?: string; headRepo?: string }
  | { page: 'issue'; key: string; number: number }
  | { page: 'new-issue'; key: string }

export interface EditorRequest { title: string; initial: string; onSave: (text: string) => OutLine[] }

/** One lesson attempt: the world plus UI state that components share. Notifies through world.bump(). */
export class Session {
  world!: World
  out: TermEntry[] = []
  openFile: string | null = null
  editorRequest: EditorRequest | null = null
  hubRoute: HubRoute = { page: 'home' }
  taskIndex = 0
  completed = false
  rightTab: 'editor' | 'hub' = 'editor'
  private once = new Set<string>()
  history: string[] = []
  lesson: Lesson
  private handle: string
  private name: string

  constructor(lesson: Lesson, handle: string, name: string) { this.lesson = lesson; this.handle = handle; this.name = name; this.reset() }

  reset() {
    const w = new World()
    w.user.handle = this.handle
    w.user.name = this.name
    w.user.email = `${this.handle}@example.com`
    this.world = w
    this.out = []
    this.openFile = null
    this.editorRequest = null
    this.once = new Set()
    this.taskIndex = 0
    this.completed = false
    this.lesson.setup(w)
    this.hubRoute = this.lesson.hubHome ? { page: 'repo', key: this.lesson.hubHome.replace('{you}', this.handle), tab: 'code' } : { page: 'home' }
    if (this.lesson.hubHome && !w.hub.repos[this.hubRoute.page === 'repo' ? this.hubRoute.key : '']) this.hubRoute = { page: 'home' }
    this.rightTab = this.lesson.panes?.editor === false && this.lesson.panes?.hub ? 'hub' : 'editor'
    this.tick(false)
    w.bump()
  }

  /** Runs after any state change: scripted events, then advance tasks. */
  tick(save = true) {
    const w = this.world
    this.lesson.onTick?.(w, { once: (k, fn) => { if (!this.once.has(k)) { this.once.add(k); fn() } } })
    const before = this.taskIndex
    while (this.taskIndex < this.lesson.tasks.length && this.lesson.tasks[this.taskIndex].check(w)) this.taskIndex++
    if (save && this.taskIndex > before) progress.taskDone(this.lesson.id, this.taskIndex)
    if (this.taskIndex === this.lesson.tasks.length && !this.completed) { this.completed = true; if (save) progress.lessonDone(this.lesson.id) }
  }

  run(cmd: string) {
    const w = this.world
    if (cmd.trim()) this.history.push(cmd)
    this.out.push({ kind: 'cmd', prompt: promptInfo(w), text: cmd })
    const res = exec(w, cmd)
    if (res.clear) this.out = []
    for (const line of res.lines) this.out.push({ kind: 'out', line })
    if (res.open) { if (w.vfs.isFile(res.open)) { this.openFile = res.open; this.rightTab = 'editor' } }
    if (res.editor) { this.editorRequest = res.editor; this.rightTab = 'editor' }
    this.tick()
    w.bump()
  }

  /** Perform a hub (GitHub UI) action. */
  act(fn: (w: World) => void): string | null {
    try { fn(this.world) } catch (e) { this.world.bump(); return e instanceof Error ? e.message : String(e) }
    this.tick()
    this.world.bump()
    return null
  }

  /** Print a line to the terminal without running anything (tab-completion lists etc.). */
  print(line: OutLine) { this.out.push({ kind: 'out', line }); this.world.bump() }
  clear() { this.out = []; this.world.bump() }

  go(route: HubRoute) { this.hubRoute = route; this.rightTab = 'hub'; this.world.bump() }

  saveFile(path: string, content: string) {
    this.world.vfs.write(path, content)
    this.tick()
    this.world.bump()
  }

  open(path: string | null) { this.openFile = path; this.rightTab = 'editor'; this.world.bump() }
  setTab(t: 'editor' | 'hub') { this.rightTab = t; this.world.bump() }

  finishEditor(text: string | null) {
    const req = this.editorRequest
    this.editorRequest = null
    if (!req) return
    if (text === null) this.out.push({ kind: 'out', line: [{ t: 'Aborting commit due to empty commit message.', c: 'err' }] })
    else {
      try { for (const l of req.onSave(text)) this.out.push({ kind: 'out', line: l }) } catch (e) { this.out.push({ kind: 'out', line: [{ t: e instanceof Error ? e.message : String(e), c: 'err' }] }) }
    }
    this.tick()
    this.world.bump()
  }

  /** Folder the editor's file tree is rooted at: the repo containing cwd, else cwd. */
  projectRoot(): string {
    const r = repoAt(this.world, this.world.cwd)
    return r ? r.root : this.world.cwd
  }
  displayPath(p: string) { return p === HOME ? '~' : p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p }
  basename = VFS.basename
}
