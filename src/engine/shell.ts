import { git, type GitResult } from './commands'
import { repoAt, headBranch, headHash, status, isClean, branches, tags } from './repo'
import { VFS, HOME } from './vfs'
import { World, type OutLine, line, GitError } from './world'

export interface ExecResult { lines: OutLine[]; clear?: boolean; open?: string; editor?: GitResult['editor'] }

/** Split a command line into argv, honoring quotes. Returns segments split on && and ; */
export function tokenize(input: string): string[][] {
  const segs: string[][] = [[]]
  let cur = '', q: string | null = null, inTok = false
  const push = () => { if (inTok) { segs[segs.length - 1].push(cur); cur = ''; inTok = false } }
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (q) { if (ch === q) q = null; else if (ch === '\\' && q === '"' && i + 1 < input.length) cur += input[++i]; else cur += ch; continue }
    if (ch === '"' || ch === "'") { q = ch; inTok = true; continue }
    if (ch === '\\' && i + 1 < input.length) { cur += input[++i]; inTok = true; continue }
    if (ch === ' ' || ch === '\t') { push(); continue }
    if (ch === '&' && input[i + 1] === '&') { push(); segs.push([]); i++; continue }
    if (ch === ';') { push(); segs.push([]); continue }
    if (ch === '>') { push(); if (input[i + 1] === '>') { segs[segs.length - 1].push('>>'); i++ } else segs[segs.length - 1].push('>'); continue }
    cur += ch; inTok = true
  }
  push()
  return segs.filter((s) => s.length)
}

const globRe = (g: string) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '.') + '$')
function expandGlobs(w: World, argv: string[]): string[] {
  const out: string[] = []
  for (const a of argv) {
    if (!/[*?]/.test(a) || a.startsWith('-')) { out.push(a); continue }
    const dir = a.includes('/') ? VFS.resolve(w.cwd, VFS.parent(a)) : w.cwd
    const pat = globRe(VFS.basename(a))
    const hits = w.vfs.isDir(dir) ? w.vfs.list(dir).filter((e) => pat.test(e.name) && (e.name.startsWith('.') === VFS.basename(a).startsWith('.'))).map((e) => (a.includes('/') ? VFS.parent(a) + '/' : '') + e.name) : []
    out.push(...(hits.length ? hits : [a]))
  }
  return out
}

/** Virtual view into .git so `ls .git` / `cat .git/HEAD` teach something. */
function gitDirView(w: World, abs: string): { list?: string[]; content?: string } | null {
  for (const [root, r] of w.repos) {
    const gd = root + '/.git'
    if (abs !== gd && !abs.startsWith(gd + '/')) continue
    const sub = abs.slice(gd.length + 1)
    const h = headHash(r)
    if (sub === '') return { list: ['HEAD', 'config', 'description', 'hooks', 'index', 'info', 'logs', 'objects', 'refs'] }
    if (sub === 'HEAD') return { content: 'branch' in r.head ? `ref: refs/heads/${r.head.branch}\n` : r.head.detached + '\n' }
    if (sub === 'config') return { content: `[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n` + Object.entries(r.remotes).map(([n, u]) => `[remote "${n}"]\n\turl = ${u}\n\tfetch = +refs/heads/*:refs/remotes/${n}/*\n`).join('') + Object.entries(r.upstream).map(([b, u]) => `[branch "${b}"]\n\tremote = ${u.split('/')[0]}\n\tmerge = refs/heads/${u.split('/').slice(1).join('/')}\n`).join('') }
    if (sub === 'refs') return { list: ['heads', 'tags', ...(Object.keys(r.refs).some((k) => k.startsWith('refs/remotes/')) ? ['remotes'] : [])] }
    if (sub === 'refs/heads') return { list: branches(r) }
    if (sub === 'refs/tags') return { list: tags(r) }
    if (sub.startsWith('refs/') && r.refs[sub]) return { content: r.refs[sub] + '\n' }
    if (sub === 'objects') return { list: [...new Set([...w.objects.keys()].map((k) => k.slice(0, 2)))].sort().slice(0, 12).concat(['info', 'pack']) }
    if (sub === 'index') return { content: `(binary) ${Object.keys(r.index).length} entries` + (h ? '' : '') + '\n' }
    if (sub === 'description') return { content: "Unnamed repository; edit this file 'description' to name the repository.\n" }
    return { list: [] }
  }
  return null
}

const say = (out: OutLine[], t: string, c?: OutLine[number]['c']) => t.split('\n').forEach((l) => out.push(line(l, c)))

export function exec(w: World, input: string): ExecResult {
  const res: ExecResult = { lines: [] }
  const segs = tokenize(input)
  if (input.trim()) w.history.push(input.trim())
  try {
    for (const seg of segs) {
      let argv = seg
      let redirect: { mode: '>' | '>>'; target: string } | null = null
      const ri = argv.findIndex((t) => t === '>' || t === '>>')
      if (ri >= 0) { redirect = { mode: argv[ri] as '>' | '>>', target: argv[ri + 1] }; argv = argv.slice(0, ri); if (!redirect.target) throw new Error('zsh: parse error near `\\n\'') }
      argv = expandGlobs(w, argv)
      const r = runOne(w, argv, res)
      if (redirect) {
        const abs = VFS.resolve(w.cwd, redirect.target)
        const text = r.map((l) => l.map((s) => s.t).join('')).join('\n') + (r.length ? '\n' : '')
        const prev = redirect.mode === '>>' && w.vfs.isFile(abs) ? w.vfs.read(abs) : ''
        w.vfs.write(abs, prev + text)
      } else res.lines.push(...r)
      if (res.editor) break
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg) say(res.lines, msg, 'err')
  }
  w.visited.add(w.cwd)
  w.bump()
  return res
}

function runOne(w: World, argv: string[], res: ExecResult): OutLine[] {
  const out: OutLine[] = []
  const [cmd, ...args] = argv
  if (!cmd) return out
  const flags = new Set(args.filter((a) => a.startsWith('-') && a.length > 1).flatMap((a) => (a.startsWith('--') ? [a.slice(2)] : a.slice(1).split(''))))
  const pos = args.filter((a) => !a.startsWith('-') || a === '-')
  const abs = (p: string) => VFS.resolve(w.cwd, p)
  const display = (p: string) => (p === HOME ? '~' : p.startsWith(HOME + '/') ? '~' + p.slice(HOME.length) : p)
  switch (cmd) {
    case 'git': {
      const g = git(w, args)
      if (g.editor) res.editor = g.editor
      return g.lines
    }
    case 'pwd': say(out, w.cwd); return out
    case 'cd': {
      const target = pos[0] ? (pos[0] === '-' ? (w as World & { prevCwd?: string }).prevCwd ?? w.cwd : abs(pos[0])) : HOME
      if (!w.vfs.isDir(target)) throw new Error(w.vfs.isFile(target) ? `cd: not a directory: ${pos[0]}` : `cd: no such file or directory: ${pos[0]}`)
      ;(w as World & { prevCwd?: string }).prevCwd = w.cwd
      w.cwd = target
      return out
    }
    case 'ls': {
      const targets = pos.length ? pos : ['.']
      for (const t of targets) {
        const p = abs(t)
        const view = gitDirView(w, p)
        let entries: { name: string; dir: boolean }[]
        if (view?.content !== undefined) { say(out, VFS.basename(p)); continue }
        else if (view?.list) entries = view.list.map((n) => ({ name: n, dir: !n.includes('.') && !['HEAD', 'config', 'index', 'description'].includes(n) && !/^[0-9a-f]{40}$/.test(n) }))
        else if (w.vfs.isFile(p)) { say(out, t); continue }
        else {
          entries = w.vfs.list(p)
          for (const [root] of w.repos) if (VFS.parent(root + '/.git') === p && !entries.some((e) => e.name === '.git')) entries.unshift({ name: '.git', dir: true })
        }
        if (!flags.has('a') && !flags.has('A')) entries = entries.filter((e) => !e.name.startsWith('.'))
        entries.sort((a, b) => a.name.localeCompare(b.name))
        if (targets.length > 1) say(out, `${t}:`)
        if (flags.has('l')) for (const e of entries) out.push([{ t: `${e.dir ? 'drwxr-xr-x' : '-rw-r--r--'}  1 you  staff  ${String(e.dir ? 96 : (w.vfs.files.get(p + '/' + e.name)?.length ?? 0)).padStart(5)} Oct  5 09:00 ` }, { t: e.name + (e.dir ? '/' : ''), c: e.dir ? 'remote' : undefined }])
        else if (entries.length) out.push(entries.flatMap((e, i): OutLine => [...(i ? [{ t: '  ' }] : []), { t: e.name + (e.dir ? '/' : ''), c: e.dir ? 'remote' : undefined }]))
      }
      return out
    }
    case 'tree': {
      const root = abs(pos[0] ?? '.')
      const walk = (dir: string, prefix: string) => {
        const entries = w.vfs.list(dir).filter((e) => e.name !== '.git' && (flags.has('a') || !e.name.startsWith('.')))
        entries.forEach((e, i) => {
          const last = i === entries.length - 1
          out.push([{ t: prefix + (last ? '└── ' : '├── ') }, { t: e.name, c: e.dir ? 'remote' : undefined }])
          if (e.dir) walk(dir + '/' + e.name, prefix + (last ? '    ' : '│   '))
        })
      }
      say(out, display(root)); walk(root, '')
      return out
    }
    case 'mkdir': {
      if (!pos.length) throw new Error('usage: mkdir [-p] directory ...')
      for (const p of pos) { if (flags.has('p')) w.vfs.mkdirp(abs(p)); else w.vfs.mkdir(abs(p)) }
      return out
    }
    case 'touch': {
      if (!pos.length) throw new Error('usage: touch file ...')
      for (const p of pos) if (!w.vfs.exists(abs(p))) { if (!w.vfs.isDir(VFS.parent(abs(p)))) throw new Error(`touch: ${p}: No such file or directory`); w.vfs.write(abs(p), '') }
      return out
    }
    case 'cat': {
      if (!pos.length) throw new Error('usage: cat file ...')
      for (const p of pos) {
        const view = gitDirView(w, abs(p))
        if (view?.content !== undefined) { say(out, view.content.replace(/\n$/, '')); continue }
        if (w.vfs.isDir(abs(p))) throw new Error(`cat: ${p}: Is a directory`)
        say(out, w.vfs.read(abs(p)).replace(/\n$/, ''))
      }
      return out
    }
    case 'head': case 'tail': {
      const n = +(args.find((a) => /^-\d+$/.test(a))?.slice(1) ?? args[args.indexOf('-n') + 1] ?? 10)
      const file = pos.filter((p) => !/^\d+$/.test(p))[0]
      if (!file) throw new Error(`usage: ${cmd} [-n lines] file`)
      const ls = w.vfs.read(abs(file)).replace(/\n$/, '').split('\n')
      say(out, (cmd === 'head' ? ls.slice(0, n) : ls.slice(-n)).join('\n'))
      return out
    }
    case 'echo': {
      const n = args[0] === '-n'
      say(out, (n ? args.slice(1) : args).join(' '))
      return out
    }
    case 'rm': {
      if (!pos.length) throw new Error('usage: rm [-rf] file ...')
      for (const p of pos) {
        const a = abs(p)
        if (!w.vfs.exists(a)) { if (flags.has('f')) continue; throw new Error(`rm: ${p}: No such file or directory`) }
        if (w.repos.has(a) && (flags.has('r') || flags.has('R'))) w.repos.delete(a)
        if (VFS.basename(a) === '.git' && w.repos.has(VFS.parent(a))) { if (!flags.has('r')) throw new Error(`rm: ${p}: is a directory`); w.repos.delete(VFS.parent(a)); w.vfs.rm(a, true); continue }
        w.vfs.rm(a, flags.has('r') || flags.has('R'))
      }
      return out
    }
    case 'mv': {
      if (pos.length < 2) throw new Error('usage: mv source target')
      const [from, to] = [abs(pos[0]), abs(pos[1])]
      if (!w.vfs.exists(from)) throw new Error(`mv: rename ${pos[0]} to ${pos[1]}: No such file or directory`)
      w.vfs.mv(from, to)
      return out
    }
    case 'cp': {
      if (pos.length < 2) throw new Error('usage: cp source target')
      const [from, to] = [abs(pos[0]), abs(pos[1])]
      if (!w.vfs.isFile(from)) throw new Error(`cp: ${pos[0]}: No such file or directory`)
      w.vfs.write(w.vfs.isDir(to) ? to + '/' + VFS.basename(from) : to, w.vfs.read(from))
      return out
    }
    case 'clear': res.clear = true; return out
    case 'code': case 'open': case 'vim': case 'nano': {
      if (!pos.length) { res.open = w.cwd; return out }
      const a = abs(pos[0])
      if (w.vfs.isDir(a)) { res.open = a; return out }
      if (!w.vfs.exists(a)) { if (!w.vfs.isDir(VFS.parent(a))) throw new Error(`${cmd}: ${pos[0]}: No such file or directory`); w.vfs.write(a, '') }
      res.open = a
      say(out, `Opening ${pos[0]} in the editor pane →`, 'dim')
      return out
    }
    case 'whoami': say(out, w.user.handle); return out
    case 'date': say(out, new Date(w.clock * 1000).toUTCString()); return out
    case 'true': return out
    case 'help': case '?':
      say(out, 'Shell commands: pwd, ls [-a], cd, mkdir [-p], touch, cat, echo [> file], head, tail, rm [-r], mv, cp, tree, code <file>, clear\nGit: type "git help" for the list of supported git commands.')
      return out
    default:
      throw new Error(`zsh: command not found: ${cmd}`)
  }
}

export function prompt(w: World): { cwd: string; branch: string | null; dirty: boolean; op: string | null; detached: string | null } {
  const r = repoAt(w, w.cwd)
  const cwd = w.cwd === HOME ? '~' : w.cwd.startsWith(HOME + '/') ? '~' + w.cwd.slice(HOME.length) : w.cwd
  if (!r) return { cwd, branch: null, dirty: false, op: null, detached: null }
  const st = status(w, r)
  return { cwd, branch: headBranch(r), dirty: !isClean(st) || st.untracked.length > 0, op: r.op?.kind ?? null, detached: 'detached' in r.head ? r.head.detached.slice(0, 7) : null }
}

const GIT_CMDS = ['add', 'blame', 'branch', 'checkout', 'cherry-pick', 'clone', 'commit', 'config', 'diff', 'fetch', 'init', 'log', 'merge', 'pull', 'push', 'rebase', 'reflog', 'remote', 'reset', 'restore', 'revert', 'rm', 'show', 'stash', 'status', 'switch', 'tag']
/** Tab completion: returns the completed input line candidates. */
export function complete(w: World, input: string): string[] {
  const toks = input.split(/\s+/)
  const last = toks[toks.length - 1] ?? ''
  const head = toks.slice(0, -1).join(' ')
  const join = (s: string) => (head ? head + ' ' : '') + s
  if (toks.length === 1) return ['git', 'cd', 'ls', 'cat', 'mkdir', 'touch', 'echo', 'rm', 'code', 'clear'].filter((c) => c.startsWith(last)).map((c) => c + ' ')
  if (toks[0] === 'git' && toks.length === 2) return GIT_CMDS.filter((c) => c.startsWith(last)).map((c) => join(c) + ' ')
  const r = repoAt(w, w.cwd)
  const cands: string[] = []
  if (toks[0] === 'git' && r && ['switch', 'checkout', 'merge', 'rebase', 'branch', 'log', 'diff', 'reset', 'show', 'cherry-pick', 'revert'].includes(toks[1])) cands.push(...branches(r), ...tags(r), ...Object.keys(r.refs).filter((k) => k.startsWith('refs/remotes/')).map((k) => k.slice(13)))
  const dir = last.includes('/') ? VFS.resolve(w.cwd, VFS.parent(last)) : w.cwd
  const pre = last.includes('/') ? last.slice(0, last.lastIndexOf('/') + 1) : ''
  if (w.vfs.isDir(dir)) cands.push(...w.vfs.list(dir).filter((e) => last.endsWith('.') || !e.name.startsWith('.') || VFS.basename(last).startsWith('.')).map((e) => pre + e.name + (e.dir ? '/' : '')))
  return [...new Set(cands)].filter((c) => c.startsWith(last)).sort().map((c) => join(c) + (c.endsWith('/') ? '' : ' '))
}

export { GitError }
