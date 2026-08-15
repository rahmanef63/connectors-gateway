/**
 * IP literal classification for the SSRF gate in `upstream_url.ts`.
 *
 * Everything here works on a hostname the WHATWG URL parser has already
 * normalised, which is what makes the tables safe to write in decimal: that
 * parser turns `0x7f.1` and `2130706433` into `127.0.0.1` before we see them.
 * It resolves nothing — a hostname that is not a literal is simply "unknown",
 * never "public".
 */

type Rule = { readonly label: string; readonly match: (parts: readonly number[]) => boolean }

/** Octet tables, not an if-chain — one row per RFC range. */
const IPV4_BLOCKED: readonly Rule[] = [
  { label: "0.0.0.0/8", match: (o) => o[0] === 0 },
  { label: "10/8", match: (o) => o[0] === 10 },
  { label: "127/8", match: (o) => o[0] === 127 },
  // 169.254/16 is link-local, and 169.254.169.254 is the CLOUD METADATA
  // endpoint on AWS/GCP/Azure/DigitalOcean — the single most valuable SSRF
  // target there is, because it hands out instance credentials to anyone who
  // can make the box issue a plain GET. Blocked by range, not by that one IP.
  { label: "169.254/16", match: (o) => o[0] === 169 && o[1] === 254 },
  { label: "172.16/12", match: (o) => o[0] === 172 && (o[1] ?? 0) >= 16 && (o[1] ?? 0) <= 31 },
  { label: "192.168/16", match: (o) => o[0] === 192 && o[1] === 168 },
]

const IPV6_BLOCKED: readonly Rule[] = [
  { label: "::/128", match: (g) => g.every((part) => part === 0) },
  { label: "::1/128", match: (g) => g.every((part, i) => (i === 7 ? part === 1 : part === 0)) },
  { label: "fc00::/7", match: (g) => ((g[0] ?? 0) & 0xfe00) === 0xfc00 },
  { label: "fe80::/10", match: (g) => ((g[0] ?? 0) & 0xffc0) === 0xfe80 },
]

/** The blocked range a host literal falls in, or null (incl. "not a literal"). */
export function blockedRange(host: string): string | null {
  const groups = parseIpv6(host)
  if (groups !== null) {
    // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d) forms carry
    // an IPv4 address in the low 32 bits, so they get the IPv4 tables too —
    // otherwise ::ffff:169.254.169.254 walks straight past every rule above.
    const low = mappedIpv4(groups)
    const v4 = low === null ? undefined : IPV4_BLOCKED.find((rule) => rule.match(low))
    if (v4 !== undefined) return v4.label
    return IPV6_BLOCKED.find((rule) => rule.match(groups))?.label ?? null
  }
  const octets = parseIpv4(host)
  if (octets === null) return null
  return IPV4_BLOCKED.find((rule) => rule.match(octets))?.label ?? null
}

/** Loopback by literal OR by name — `localhost` is in no address table. */
export function isLoopback(host: string): boolean {
  if (host === "localhost" || host.endsWith(".localhost")) return true
  const octets = parseIpv4(host)
  if (octets !== null) return octets[0] === 127
  const groups = parseIpv6(host)
  if (groups === null) return false
  if (groups.every((part, i) => (i === 7 ? part === 1 : part === 0))) return true
  const low = mappedIpv4(groups)
  return low !== null && low[0] === 127
}

/** Strict dotted quad. */
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

/** `[::1]` bracket form as the URL parser serialises it, plus bare literals. */
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

/** Low 32 bits as octets when the high 96 bits are ::ffff: or :: — else null. */
function mappedIpv4(groups: readonly number[]): readonly number[] | null {
  const marker = groups[5] ?? 0
  if (!groups.slice(0, 5).every((part) => part === 0)) return null
  if (marker !== 0xffff && marker !== 0) return null
  const high = groups[6] ?? 0
  const low = groups[7] ?? 0
  return [high >> 8, high & 0xff, low >> 8, low & 0xff]
}
