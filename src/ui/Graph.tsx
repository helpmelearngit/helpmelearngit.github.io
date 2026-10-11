import { useMemo } from 'react'
import type { Session } from './session'
import { useWorld } from '../store/world'
import { repoAt, headHash, walk, decorations, subject } from '../engine/repo'
import { short } from '../engine/hash'

const COLORS = ['#f05133', '#2f80ed', '#22a06b', '#8957e5', '#e6a700', '#d6336c', '#0ca678']

export function Graph({ session }: { session: Session }) {
  useWorld(session.world)
  const w = session.world
  const r = repoAt(w, w.cwd) ?? [...w.repos.values()].at(-1)
  const data = useMemo(() => {
    if (!r) return null
    const starts = [...new Set([...Object.values(r.refs), ...(headHash(r) ? [headHash(r)!] : []), ...r.stash])]
    if (!starts.length) return { rows: [], lanes: 0 }
    const hashes = walk(w, starts, 60)
    const lanes: (string | null)[] = []
    const rows: { h: string; lane: number; parents: string[] }[] = []
    for (const h of hashes) {
      let lane = lanes.indexOf(h)
      if (lane < 0) { lane = lanes.indexOf(null); if (lane < 0) { lanes.push(null); lane = lanes.length - 1 } }
      const parents = w.commit(h).parents
      rows.push({ h, lane, parents })
      lanes[lane] = parents[0] ?? null
      for (const p of parents.slice(1)) if (!lanes.includes(p)) { const f = lanes.indexOf(null); if (f >= 0) lanes[f] = p; else lanes.push(p) }
      for (let i = 0; i < lanes.length; i++) for (let j = i + 1; j < lanes.length; j++) if (lanes[i] && lanes[i] === lanes[j]) lanes[j] = null
    }
    return { rows, lanes: Math.max(1, ...rows.map((x) => x.lane + 1)) }
  }, [w, w.version, r])

  if (!r) return <Empty text="No repository yet. Run git init to see the graph." />
  if (!data || !data.rows.length) return <Empty text="No commits yet. The graph fills in as you commit." />

  const X = 18, Y = 30, PAD = 14
  const pos = new Map(data.rows.map((row, i) => [row.h, { x: PAD + row.lane * X, y: PAD + i * Y }]))
  const height = PAD * 2 + (data.rows.length - 1) * Y
  const gw = PAD * 2 + (data.lanes - 1) * X
  const head = headHash(r)

  return (
    <div className="h-full overflow-auto bg-white">
      <svg width="100%" height={height} className="block" style={{ minWidth: 260 }}>
        {data.rows.map((row) => row.parents.map((p) => {
          const a = pos.get(row.h)!, b = pos.get(p)
          if (!b) return null
          const color = COLORS[(row.lane) % COLORS.length]
          const d = a.x === b.x ? `M${a.x},${a.y} L${b.x},${b.y}` : `M${a.x},${a.y} C${a.x},${a.y + Y / 2} ${b.x},${b.y - Y / 2} ${b.x},${b.y}`
          return <path key={row.h + p} d={d} stroke={color} strokeWidth={2} fill="none" opacity={0.8} />
        }))}
        {data.rows.map((row) => {
          const { x, y } = pos.get(row.h)!
          const deco = decorations(r, row.h)
          const isHead = row.h === head
          const stashIdx = r.stash.indexOf(row.h)
          const c = w.commit(row.h)
          let tx = gw + 6
          return (
            <g key={row.h}>
              <circle cx={x} cy={y} r={isHead ? 6 : 4.5} fill={row.parents.length > 1 ? 'white' : COLORS[row.lane % COLORS.length]} stroke={COLORS[row.lane % COLORS.length]} strokeWidth={2.5} />
              <title>{`${short(row.h)} ${subject(c.message)}\n${c.author}`}</title>
              <text x={tx} y={y + 4} fontSize={11} fontFamily="ui-monospace, monospace" fill="#7c8aa3">{short(row.h)}</text>
              {(() => { tx += 56; return null })()}
              {deco.map((d) => {
                const wdt = d.text.length * 6.2 + 12
                const el = (
                  <g key={d.text}>
                    <rect x={tx} y={y - 9} width={wdt} height={18} rx={9} fill={d.c === 'head' ? '#2f80ed' : d.c === 'branch' ? '#22a06b' : d.c === 'remote' ? '#f05133' : '#e6a700'} opacity={0.95} />
                    <text x={tx + 6} y={y + 4} fontSize={10.5} fontFamily="ui-monospace, monospace" fill="white" fontWeight={600}>{d.text}</text>
                  </g>
                )
                tx += wdt + 4
                return el
              })}
              {stashIdx >= 0 && (() => { const t = `stash@{${stashIdx}}`; const wdt = t.length * 6.2 + 12; const el = <g key="stash"><rect x={tx} y={y - 9} width={wdt} height={18} rx={9} fill="#8957e5" /><text x={tx + 6} y={y + 4} fontSize={10.5} fontFamily="ui-monospace, monospace" fill="white" fontWeight={600}>{t}</text></g>; tx += wdt + 4; return el })()}
              <text x={tx} y={y + 4} fontSize={12} fill="#1b2433">{subject(c.message).slice(0, 60)}{subject(c.message).length > 60 ? '…' : ''}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

const Empty = ({ text }: { text: string }) => <div className="flex h-full items-center justify-center bg-white p-6 text-center text-sm text-ink-400">{text}</div>
