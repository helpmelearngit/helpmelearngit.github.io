export const HOME = '/home/you'

export class VFS {
  files = new Map<string, string>()
  dirs = new Set<string>(['/', '/home', HOME])

  static normalize(p: string): string {
    const parts: string[] = []
    for (const seg of p.split('/')) {
      if (seg === '' || seg === '.') continue
      if (seg === '..') parts.pop()
      else parts.push(seg)
    }
    return '/' + parts.join('/')
  }

  static resolve(cwd: string, p: string): string {
    if (p === '~' || p.startsWith('~/')) p = HOME + p.slice(1)
    return VFS.normalize(p.startsWith('/') ? p : cwd + '/' + p)
  }

  static parent(p: string): string {
    const i = p.lastIndexOf('/')
    return i <= 0 ? '/' : p.slice(0, i)
  }

  static basename(p: string): string {
    return p.slice(p.lastIndexOf('/') + 1)
  }

  isFile(p: string) { return this.files.has(p) }
  isDir(p: string) { return this.dirs.has(p) }
  exists(p: string) { return this.isFile(p) || this.isDir(p) }

  read(p: string): string {
    const c = this.files.get(p)
    if (c === undefined) throw new Error(`cat: ${p}: No such file or directory`)
    return c
  }

  write(p: string, content: string) {
    if (this.isDir(p)) throw new Error(`${p}: Is a directory`)
    this.mkdirp(VFS.parent(p))
    this.files.set(p, content)
  }

  mkdirp(p: string) {
    let cur = ''
    for (const seg of p.split('/').filter(Boolean)) {
      cur += '/' + seg
      if (this.isFile(cur)) throw new Error(`mkdir: ${cur}: Not a directory`)
      this.dirs.add(cur)
    }
  }

  mkdir(p: string) {
    if (this.exists(p)) throw new Error(`mkdir: ${p}: File exists`)
    if (!this.isDir(VFS.parent(p))) throw new Error(`mkdir: ${p}: No such file or directory`)
    this.dirs.add(p)
  }

  /** Direct children names of a directory. */
  list(dir: string): { name: string; dir: boolean }[] {
    if (!this.isDir(dir)) throw new Error(`ls: ${dir}: No such file or directory`)
    const prefix = dir === '/' ? '/' : dir + '/'
    const out = new Map<string, boolean>()
    for (const d of this.dirs) if (d.startsWith(prefix) && d !== dir) out.set(d.slice(prefix.length).split('/')[0], true)
    for (const f of this.files.keys()) if (f.startsWith(prefix)) {
      const rest = f.slice(prefix.length)
      const i = rest.indexOf('/')
      if (i === -1) out.set(rest, false); else out.set(rest.slice(0, i), true)
    }
    return [...out].map(([name, dir]) => ({ name, dir })).sort((a, b) => a.name.localeCompare(b.name))
  }

  /** All file paths under dir (recursive, absolute), excluding .git internals. */
  filesUnder(dir: string): string[] {
    const prefix = dir === '/' ? '/' : dir + '/'
    return [...this.files.keys()].filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).split('/').includes('.git')).sort()
  }

  rm(p: string, recursive = false) {
    if (this.isFile(p)) { this.files.delete(p); return }
    if (!this.isDir(p)) throw new Error(`rm: ${p}: No such file or directory`)
    if (!recursive) throw new Error(`rm: ${p}: is a directory`)
    const prefix = p + '/'
    for (const f of [...this.files.keys()]) if (f.startsWith(prefix)) this.files.delete(f)
    for (const d of [...this.dirs]) if (d === p || d.startsWith(prefix)) this.dirs.delete(d)
  }

  mv(from: string, to: string) {
    if (this.isFile(from)) {
      if (this.isDir(to)) to = to + '/' + VFS.basename(from)
      const c = this.files.get(from)!
      this.files.delete(from)
      this.write(to, c)
      return
    }
    if (!this.isDir(from)) throw new Error(`mv: ${from}: No such file or directory`)
    const prefix = from + '/'
    for (const f of [...this.files.keys()]) if (f.startsWith(prefix)) { const c = this.files.get(f)!; this.files.delete(f); this.files.set(to + f.slice(from.length), c) }
    for (const d of [...this.dirs]) if (d === from || d.startsWith(prefix)) { this.dirs.delete(d); this.dirs.add(to + d.slice(from.length)) }
  }
}
