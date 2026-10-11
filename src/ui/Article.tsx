import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ReactNode } from 'react'

const CALLOUTS: Record<string, string> = { note: '', tip: 'tip', why: 'why', warning: 'warn', danger: 'danger' }

function textOf(n: ReactNode): string {
  if (typeof n === 'string') return n
  if (Array.isArray(n)) return n.map(textOf).join('')
  if (n && typeof n === 'object' && 'props' in n) return textOf((n as { props: { children?: ReactNode } }).props.children)
  return ''
}

export function Article({ md, className = '' }: { md: string; className?: string }) {
  return (
    <div className={`article ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          blockquote: ({ children }) => {
            const first = textOf(children).trim().split('\n')[0].toLowerCase()
            const kind = Object.keys(CALLOUTS).find((k) => first.startsWith(k))
            return <blockquote className={kind ? CALLOUTS[kind] : ''}>{children}</blockquote>
          },
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const lang = /language-(\w+)/.exec(className ?? '')?.[1]
            const text = String(children).replace(/\n$/, '')
            if (!lang && !text.includes('\n')) return <code>{children}</code>
            if (lang === 'figure') {
              const lines = text.split('\n')
              const cap = lines.findLast((l) => l.startsWith('caption:'))
              const body = lines.filter((l) => !l.startsWith('caption:')).join('\n')
              return <div className="figure"><pre>{body}</pre>{cap && <div className="cap">{cap.slice(8).trim()}</div>}</div>
            }
            return <pre><code>{text.split('\n').map((l, i) => <span key={i} className={l.startsWith('$ ') ? 'text-white' : l.startsWith('+') && lang !== 'figure' ? 'text-[#7ee787]' : l.startsWith('-') && /^-{1}[^-]/.test(l) ? 'text-[#ff7b72]' : 'text-ink-300'}>{l}{'\n'}</span>)}</code></pre>
          },
        }}
      >
        {md}
      </Markdown>
    </div>
  )
}
