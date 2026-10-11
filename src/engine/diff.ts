export type Op = { t: 'eq' | 'add' | 'del'; line: string }

export const splitLines = (s: string) => (s === '' ? [] : s.replace(/\n$/, '').split('\n'))

/** LCS line diff. ponytail: O(n*m) DP, fine for lesson-sized files. */
export function diffLines(a: string, b: string): Op[] {
  const A = splitLines(a), B = splitLines(b)
  const n = A.length, m = B.length
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const ops: Op[] = []
  let i = 0, j = 0
  while (i < n && j < m) {
    if (A[i] === B[j]) { ops.push({ t: 'eq', line: A[i] }); i++; j++ }
    else if (dp[i + 1][j] >= dp[i][j + 1]) ops.push({ t: 'del', line: A[i++] })
    else ops.push({ t: 'add', line: B[j++] })
  }
  while (i < n) ops.push({ t: 'del', line: A[i++] })
  while (j < m) ops.push({ t: 'add', line: B[j++] })
  return ops
}

export type DiffLine = { kind: 'hunk' | 'ctx' | 'add' | 'del' | 'meta'; text: string }

/** Unified diff with 3 lines of context, as git prints it. */
export function unifiedDiff(path: string, a: string | undefined, b: string | undefined): DiffLine[] {
  const out: DiffLine[] = [{ kind: 'meta', text: `diff --git a/${path} b/${path}` }]
  if (a === undefined) out.push({ kind: 'meta', text: 'new file mode 100644' })
  if (b === undefined) out.push({ kind: 'meta', text: 'deleted file mode 100644' })
  out.push({ kind: 'meta', text: `--- ${a === undefined ? '/dev/null' : 'a/' + path}` })
  out.push({ kind: 'meta', text: `+++ ${b === undefined ? '/dev/null' : 'b/' + path}` })
  const ops = diffLines(a ?? '', b ?? '')
  const C = 3
  // find change indices, group into hunks
  const changed = ops.map((o, i) => (o.t !== 'eq' ? i : -1)).filter((i) => i >= 0)
  if (changed.length === 0) return out
  let start = Math.max(0, changed[0] - C)
  let end = Math.min(ops.length, changed[0] + C + 1)
  const hunks: [number, number][] = []
  for (const ci of changed.slice(1)) {
    if (ci - C <= end) end = Math.min(ops.length, ci + C + 1)
    else { hunks.push([start, end]); start = Math.max(0, ci - C); end = Math.min(ops.length, ci + C + 1) }
  }
  hunks.push([start, end])
  let ai = 0, bi = 0, idx = 0
  for (const [s, e] of hunks) {
    while (idx < s) { const o = ops[idx++]; if (o.t !== 'add') ai++; if (o.t !== 'del') bi++ }
    const slice = ops.slice(s, e)
    const aLen = slice.filter((o) => o.t !== 'add').length, bLen = slice.filter((o) => o.t !== 'del').length
    out.push({ kind: 'hunk', text: `@@ -${ai + 1},${aLen} +${bi + 1},${bLen} @@` })
    for (const o of slice) {
      out.push({ kind: o.t === 'eq' ? 'ctx' : o.t, text: (o.t === 'eq' ? ' ' : o.t === 'add' ? '+' : '-') + o.line })
      if (o.t !== 'add') ai++
      if (o.t !== 'del') bi++
    }
    idx = e
  }
  return out
}

/** Three-way merge of text. Returns merged content and whether conflict markers were written.
 *  Adjacent changes (no untouched base line between them) conflict, as in git. */
export function merge3(base: string, ours: string, theirs: string, oursLabel = 'HEAD', theirsLabel = 'theirs'): { content: string; conflict: boolean } {
  const B = splitLines(base)
  const n = B.length
  const side = (s: string) => {
    const changed: boolean[] = new Array(n).fill(false)
    const rep: (string[] | undefined)[] = new Array(n)
    const ins: string[][] = Array.from({ length: n + 1 }, () => [])
    let bi = 0
    let hunk: { s: number; e: number; lines: string[] } | null = null
    const close = () => {
      if (!hunk) return
      if (hunk.e > hunk.s) { for (let k = hunk.s; k < hunk.e; k++) changed[k] = true; rep[hunk.s] = hunk.lines }
      else ins[hunk.s].push(...hunk.lines)
      hunk = null
    }
    for (const o of diffLines(base, s)) {
      if (o.t === 'eq') { close(); bi++; continue }
      if (!hunk) hunk = { s: bi, e: bi, lines: [] }
      if (o.t === 'del') { hunk.e = bi + 1; bi++ } else hunk.lines.push(o.line)
    }
    close()
    return { changed, rep, ins }
  }
  const O = side(ours), T = side(theirs)
  const stable = (i: number) => (i < n ? !O.changed[i] && !T.changed[i] : true) && O.ins[i].length === 0 && T.ins[i].length === 0
  const render = (S: typeof O, i: number, j: number) => {
    const out: string[] = []
    for (let k = i; k < j; k++) { out.push(...S.ins[k]); if (S.changed[k]) { const rp = S.rep[k]; if (rp) out.push(...rp) } else out.push(B[k]) }
    out.push(...S.ins[j])
    return out
  }
  const eq = (x: string[], y: string[]) => x.length === y.length && x.every((v, k) => v === y[k])
  const out: string[] = []
  let conflict = false
  let i = 0
  while (i <= n) {
    if (stable(i)) { if (i === n) break; out.push(B[i]); i++; continue }
    let j = i
    while (j < n && !stable(j)) j++
    const o = render(O, i, j), t = render(T, i, j), b = B.slice(i, j)
    if (eq(o, t)) out.push(...o)
    else if (eq(o, b)) out.push(...t)
    else if (eq(t, b)) out.push(...o)
    else { conflict = true; out.push(`<<<<<<< ${oursLabel}`, ...o, '=======', ...t, `>>>>>>> ${theirsLabel}`) }
    if (j === n) break
    i = j
  }
  return { content: out.length ? out.join('\n') + '\n' : '', conflict }
}
