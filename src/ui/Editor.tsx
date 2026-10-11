import { useEffect, useRef, useState } from 'react'
import { EditorView, keymap, Decoration, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { basicSetup } from 'codemirror'
import { markdown } from '@codemirror/lang-markdown'
import { javascript } from '@codemirror/lang-javascript'
import type { Session } from './session'
import { useWorld } from '../store/world'
import { repoAt, status } from '../engine/repo'

const conflictHighlight = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view: EditorView) {
    const marks: { from: number; cls: string }[] = []
    let side: 'ours' | 'theirs' | null = null
    for (let i = 1; i <= view.state.doc.lines; i++) {
      const line = view.state.doc.line(i)
      if (line.text.startsWith('<<<<<<<')) { side = 'ours'; marks.push({ from: line.from, cls: 'cm-conflict-marker' }); continue }
      if (line.text.startsWith('=======')) { side = 'theirs'; marks.push({ from: line.from, cls: 'cm-conflict-marker' }); continue }
      if (line.text.startsWith('>>>>>>>')) { side = null; marks.push({ from: line.from, cls: 'cm-conflict-marker' }); continue }
      if (side) marks.push({ from: line.from, cls: side === 'ours' ? 'cm-conflict-ours' : 'cm-conflict-theirs' })
    }
    return Decoration.set(marks.map((m) => Decoration.line({ class: m.cls }).range(m.from)))
  }
}, { decorations: (v) => v.decorations })

export function Editor({ session }: { session: Session }) {
  useWorld(session.world)
  const w = session.world
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const loaded = useRef<{ path: string; content: string } | null>(null)
  const [dirty, setDirty] = useState(false)
  const [, force] = useState(0)
  const file = session.openFile

  const save = () => {
    const v = view.current
    if (!v || !session.openFile) return
    const text = v.state.doc.toString()
    loaded.current = { path: session.openFile, content: text }
    session.saveFile(session.openFile, text)
    setDirty(false)
  }

  useEffect(() => {
    if (!host.current) return
    view.current = new EditorView({
      parent: host.current,
      state: EditorState.create({ doc: '', extensions: [] }),
    })
    return () => { view.current?.destroy(); view.current = null }
  }, [])

  // load file into the editor when the open file changes, or when it changed on disk and we are not dirty
  useEffect(() => {
    const v = view.current
    if (!v) return
    if (!file) { loaded.current = null; return }
    const content = w.vfs.files.get(file)
    if (content === undefined) { session.openFile = null; loaded.current = null; return }
    const changedOnDisk = loaded.current?.path === file && loaded.current.content !== content
    if (loaded.current?.path === file && !changedOnDisk) return
    if (changedOnDisk && dirty) return
    loaded.current = { path: file, content }
    const lang = file.endsWith('.md') ? [markdown()] : /\.(js|ts|json)$/.test(file) ? [javascript()] : []
    v.setState(EditorState.create({
      doc: content,
      extensions: [
        basicSetup, conflictHighlight, ...lang, EditorView.lineWrapping,
        keymap.of([{ key: 'Mod-s', run: () => { save(); return true } }]),
        EditorView.updateListener.of((u) => { if (u.docChanged) { setDirty(u.state.doc.toString() !== loaded.current?.content); force((x) => x + 1) } }),
        EditorView.theme({ '&': { height: '100%' }, '.cm-scroller': { overflow: 'auto' } }),
      ],
    }))
    setDirty(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, w.version])

  const root = session.projectRoot()
  const repo = repoAt(w, root)
  const st = repo ? status(w, repo) : null
  const badge = (abs: string): { t: string; c: string } | null => {
    if (!repo || !st) return null
    const rel = abs.slice(repo.root.length + 1)
    if (st.conflicts.includes(rel)) return { t: '!', c: 'text-ember-500' }
    if (st.staged.some((s) => s.path === rel && s.kind === 'new file')) return { t: 'A', c: 'text-leaf-500' }
    if (st.staged.some((s) => s.path === rel) || st.unstaged.some((s) => s.path === rel)) return { t: 'M', c: 'text-sun-500' }
    if (st.untracked.includes(rel)) return { t: 'U', c: 'text-leaf-500' }
    return null
  }

  const tree = (dir: string, depth: number): React.ReactNode[] => {
    let entries: { name: string; dir: boolean }[] = []
    try { entries = w.vfs.list(dir).filter((e) => e.name !== '.git') } catch { return [] }
    return entries.flatMap((e) => {
      const p = dir + '/' + e.name
      if (e.dir) return [<div key={p} className="text-ink-300" style={{ paddingLeft: 8 + depth * 12 }}>▾ {e.name}</div>, ...tree(p, depth + 1)]
      const b = badge(p)
      const active = p === file
      return [<button key={p} onClick={() => session.open(p)} className={`flex w-full items-center gap-2 truncate rounded px-2 py-0.5 text-left hover:bg-ink-700 ${active ? 'bg-ink-700 text-white' : 'text-ink-200'}`} style={{ paddingLeft: 8 + depth * 12 }}>
        <span className="truncate">{e.name}</span>{b && <span className={`ml-auto font-mono text-[10px] font-bold ${b.c}`}>{b.t}</span>}
      </button>]
    })
  }

  const req = session.editorRequest
  return (
    <div className="relative flex h-full bg-ink-900 text-ink-100">
      <div className="w-44 shrink-0 overflow-auto border-r border-ink-800 py-2 text-[12px]">
        <div className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-400">Explorer · {session.displayPath(root)}</div>
        {tree(root, 0)}
        {(() => { try { return w.vfs.list(root).filter((e) => e.name !== '.git').length === 0 } catch { return true } })() && <div className="px-3 text-ink-400">empty folder</div>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-center gap-2 border-b border-ink-800 bg-ink-950 px-3 text-[12px]">
          {file ? <><span className="text-ink-200">{session.displayPath(file)}</span>{dirty && <span className="h-2 w-2 rounded-full bg-sun-500" title="unsaved" />}</> : <span className="text-ink-400">No file open — run <code className="text-ink-200">code &lt;file&gt;</code> or click one in the explorer</span>}
          {file && <button onClick={save} disabled={!dirty} className="ml-auto rounded bg-sky-500 px-2.5 py-1 text-[11px] font-semibold text-white disabled:opacity-40">Save <span className="kbd ml-1 border-sky-400 bg-sky-500 text-white">⌘S</span></button>}
        </div>
        <div ref={host} className={`min-h-0 flex-1 bg-white text-ink-900 ${file ? '' : 'hidden'}`} />
        {!file && <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-ink-400">The editor pane. Files you edit here are saved into the simulated project when you press Save.</div>}
      </div>
      {req && <CommitMessageEditor title={req.title} initial={req.initial} onDone={(t) => session.finishEditor(t)} />}
    </div>
  )
}

function CommitMessageEditor({ title, initial, onDone }: { title: string; initial: string; onDone: (t: string | null) => void }) {
  const [text, setText] = useState(initial)
  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-ink-950/95 p-4">
      <div className="mb-2 flex items-center text-[12px] text-ink-300"><span className="font-mono">{title}</span><span className="ml-2 text-ink-400">— Git opened this because you ran <code>git commit</code> without <code>-m</code>. Lines starting with # are ignored.</span></div>
      <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); onDone(text) } if (e.key === 'Escape') onDone(null) }}
        className="min-h-0 flex-1 resize-none rounded-lg border border-ink-700 bg-ink-900 p-3 font-mono text-[13px] text-ink-100 outline-none" spellCheck={false} />
      <div className="mt-3 flex gap-2">
        <button onClick={() => onDone(text)} className="btn-primary">Save and close <span className="kbd border-ember-400 bg-ember-500 text-white">⌘S</span></button>
        <button onClick={() => onDone(null)} className="btn-ghost text-ink-200 hover:bg-ink-800">Abort (empty message)</button>
      </div>
    </div>
  )
}

