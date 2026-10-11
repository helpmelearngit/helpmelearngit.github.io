// ponytail: non-cryptographic 160-bit-looking hash (two cyrb53 passes). Swap for SHA-1 if real git interop ever matters.
function cyrb53(str: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

export function hash(s: string): string {
  const a = cyrb53(s, 1).toString(16).padStart(14, '0')
  const b = cyrb53(s, 2).toString(16).padStart(14, '0')
  const c = cyrb53(s, 3).toString(16).padStart(12, '0')
  return (a + b + c).slice(0, 40)
}

export const short = (h: string) => h.slice(0, 7)
