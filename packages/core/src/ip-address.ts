/**
 * Classifies IP literals and localhost names for SSRF gates.
 *
 * Hostnames are deliberately not DNS-resolved here. Callers must not mistake
 * `null` for "public": it means only "not a blocked literal". Runtime DNS
 * pinning is a separate transport concern.
 */
type Rule = { readonly label: string; readonly match: (parts: readonly number[]) => boolean }

const IPV4_BLOCKED: readonly Rule[] = [
  { label: "0.0.0.0/8", match: (o) => o[0] === 0 },
  { label: "10.0.0.0/8", match: (o) => o[0] === 10 },
  { label: "100.64.0.0/10", match: (o) => o[0] === 100 && ((o[1] ?? 0) & 0xc0) === 0x40 },
  { label: "127.0.0.0/8", match: (o) => o[0] === 127 },
  { label: "169.254.0.0/16", match: (o) => o[0] === 169 && o[1] === 254 },
  { label: "172.16.0.0/12", match: (o) => o[0] === 172 && (o[1] ?? 0) >= 16 && (o[1] ?? 0) <= 31 },
  { label: "192.0.0.0/24", match: (o) => o[0] === 192 && o[1] === 0 && o[2] === 0 },
  { label: "192.0.2.0/24", match: (o) => o[0] === 192 && o[1] === 0 && o[2] === 2 },
  { label: "192.88.99.0/24", match: (o) => o[0] === 192 && o[1] === 88 && o[2] === 99 },
  { label: "192.168.0.0/16", match: (o) => o[0] === 192 && o[1] === 168 },
  { label: "198.18.0.0/15", match: (o) => o[0] === 198 && ((o[1] ?? 0) & 0xfe) === 18 },
  { label: "198.51.100.0/24", match: (o) => o[0] === 198 && o[1] === 51 && o[2] === 100 },
  { label: "203.0.113.0/24", match: (o) => o[0] === 203 && o[1] === 0 && o[2] === 113 },
  { label: "224.0.0.0/4", match: (o) => ((o[0] ?? 0) & 0xf0) === 0xe0 },
  { label: "240.0.0.0/4", match: (o) => ((o[0] ?? 0) & 0xf0) === 0xf0 },
]

const IPV6_BLOCKED: readonly Rule[] = [
  { label: "::/128", match: (g) => g.every((part) => part === 0) },
  { label: "::1/128", match: (g) => g.every((part, i) => (i === 7 ? part === 1 : part === 0)) },
  { label: "100::/64", match: (g) => g[0] === 0x0100 && g.slice(1, 4).every((part) => part === 0) },
  { label: "2001:db8::/32", match: (g) => g[0] === 0x2001 && g[1] === 0x0db8 },
  { label: "fc00::/7", match: (g) => ((g[0] ?? 0) & 0xfe00) === 0xfc00 },
  { label: "fe80::/10", match: (g) => ((g[0] ?? 0) & 0xffc0) === 0xfe80 },
  { label: "ff00::/8", match: (g) => ((g[0] ?? 0) & 0xff00) === 0xff00 },
]

/** The blocked non-global range a host literal falls in, or null. */
export function blockedRange(host: string): string | null {
  const canonical = host.toLowerCase().replace(/\.+$/, "")
  const groups = parseIpv6(canonical)
  if (groups !== null) {
    const low = mappedIpv4(groups)
    const v4 = low === null ? undefined : IPV4_BLOCKED.find((rule) => rule.match(low))
    if (v4 !== undefined) return v4.label
    return IPV6_BLOCKED.find((rule) => rule.match(groups))?.label ?? null
  }
  const octets = parseIpv4(canonical)
  if (octets === null) return null
  return IPV4_BLOCKED.find((rule) => rule.match(octets))?.label ?? null
}

/** Loopback by literal or RFC localhost name. */
export function isLoopback(host: string): boolean {
  const canonical = host.toLowerCase().replace(/\.+$/, "")
  if (canonical === "localhost" || canonical.endsWith(".localhost")) return true
  const octets = parseIpv4(canonical)
  if (octets !== null) return octets[0] === 127
  const groups = parseIpv6(canonical)
  if (groups === null) return false
  if (groups.every((part, i) => (i === 7 ? part === 1 : part === 0))) return true
  const low = mappedIpv4(groups)
  return low !== null && low[0] === 127
}

function parseIpv4(host: string): readonly number[] | null {
  const parts = host.split(".")
  if (parts.length !== 4) return null
  const octets: number[] = []
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const value = Number(part)
    if (value > 255) return null
    octets.push(value)
  }
  return octets
}

function parseIpv6(host: string): readonly number[] | null {
  const body = host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host
  if (!body.includes(":")) return null
  const halves = body.split("::")
  if (halves.length > 2) return null
  const head = expandGroups(halves[0] ?? "")
  const tail = halves.length === 2 ? expandGroups(halves[1] ?? "") : []
  if (head === null || tail === null) return null
  const fill = 8 - head.length - tail.length
  if (fill < 0 || (halves.length === 1 && fill !== 0)) return null
  return [...head, ...new Array<number>(fill).fill(0), ...tail]
}

function expandGroups(part: string): number[] | null {
  if (part === "") return []
  const out: number[] = []
  for (const group of part.split(":")) {
    if (group.includes(".")) {
      const quad = parseIpv4(group)
      if (quad === null) return null
      out.push(((quad[0] ?? 0) << 8) | (quad[1] ?? 0), ((quad[2] ?? 0) << 8) | (quad[3] ?? 0))
      continue
    }
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null
    out.push(Number.parseInt(group, 16))
  }
  return out
}

function mappedIpv4(groups: readonly number[]): readonly number[] | null {
  const marker = groups[5] ?? 0
  if (!groups.slice(0, 5).every((part) => part === 0)) return null
  if (marker !== 0xffff && marker !== 0) return null
  const high = groups[6] ?? 0
  const low = groups[7] ?? 0
  return [high >> 8, high & 0xff, low >> 8, low & 0xff]
}
