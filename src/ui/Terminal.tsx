import { useEffect, useRef, useState } from 'react'
import type { Session } from './session'
import { complete, prompt as promptOf } from '../engine/shell'
import { useWorld } from '../store/world'

export function Terminal({ session }: { session: Session }) {
  useWorld(session.world)
  const [input, setInput] = useState('')
  const [histIdx, setHistIdx] = useState(-1)
  const scroller = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const w = session.world

  useEffect(() => { const el = scroller.current; if (el) el.scrollTop = el.scrollHeight }, [session.out.length, w.version])

  const prompt = (p: ReturnType<typeof promptOf>) => (
    <span className="whitespace-pre">
      <span className="text-[#7ee787]">{w.user.handle}</span>
      <span className="text-ink-400">@</span>
      <span className="text-[#79c0ff]">{p.cwd}</span>
      {p.branch && <span className="text-[#e3b341]"> ({p.branch}{p.op ? `|${p.op.toUpperCase()}` : ''}{p.dirty ? '*' : ''})</span>}
      {!p.branch && p.detached && <span className="text-[#e3b341]"> (HEAD detached at {p.detached})</span>}
      <span className="text-ink-300"> $ </span>
    </span>
  )

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      session.run(input)
      setInput('')
      setHistIdx(-1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const h = session.history
      const idx = histIdx < 0 ? h.length - 1 : Math.max(0, histIdx - 1)
      if (h[idx] !== undefined) { setHistIdx(idx); setInput(h[idx]) }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const h = session.history
      if (histIdx < 0) return
      const idx = histIdx + 1
      if (idx >= h.length) { setHistIdx(-1); setInput('') } else { setHistIdx(idx); setInput(h[idx]) }
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const c = complete(w, input)
      if (c.length === 1) setInput(c[0])
      else if (c.length > 1) {
        const common = c.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i) })
        if (common.length > input.length) setInput(common)
        else session.print([{ t: c.map((x) => x.trim().split(' ').pop()).join('  '), c: 'dim' }])
      }
    } else if (e.key === 'l' && e.ctrlKey) { e.preventDefault(); session.clear() }
    else if (e.key === 'c' && e.ctrlKey) { e.preventDefault(); setInput('') }
  }

  const live = session.editorRequest === null
  return (
    <div className="term flex h-full flex-col bg-ink-950 text-ink-100" onClick={() => inputRef.current?.focus()}>
      <div className="flex items-center gap-2 border-b border-ink-800 px-3 py-1.5 text-[11px] text-ink-400">
        <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" /><span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" /><span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
        <span className="ml-2 font-sans">Terminal — zsh (simulated)</span>
        <span className="ml-auto font-sans">↑ history · Tab completes · <code>help</code></span>
      </div>
      <div ref={scroller} className="flex-1 overflow-auto px-3 py-2">
        {session.out.length === 0 && <div className="dim mb-2">Type a command and press Enter. Try <span className="text-ink-100">git status</span> or <span className="text-ink-100">help</span>.</div>}
        {session.out.map((e, i) => e.kind === 'cmd'
          ? <div key={i} className="whitespace-pre-wrap break-all">{prompt(e.prompt)}<span>{e.text}</span></div>
          : <div key={i} className="whitespace-pre-wrap break-all min-h-[1.5em]">{e.line.map((s, j) => <span key={j} className={s.c}>{s.t}</span>)}</div>)}
        <div className="flex whitespace-pre-wrap break-all">
          {prompt(promptOf(w))}
          <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} disabled={!live} autoFocus spellCheck={false} autoCapitalize="off" autoComplete="off"
            className="flex-1 bg-transparent outline-none caret-ink-100 text-ink-100 disabled:opacity-50" placeholder={live ? '' : 'finish the commit message in the editor pane…'} aria-label="terminal input" />
        </div>
      </div>
    </div>
  )
}
