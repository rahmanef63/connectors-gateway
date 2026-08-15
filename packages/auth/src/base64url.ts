/**
 * base64url codec over `atob`/`btoa` so the same code runs in Bun, Node 22 and
 * the Convex runtime. No node:buffer, no dependency.
 */

const CHUNK = 0x8000
const STANDARD_B64 = /^[A-Za-z0-9+/]*={0,2}$/

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

/**
 * Decodes base64url. Standard base64 (`+`, `/`, padding) is accepted too so an
 * `openssl rand -base64 32` key works verbatim.
 * Returns null instead of throwing: callers turn that into a generic denial.
 */
export function fromBase64Url(value: string): Uint8Array | null {
  if (typeof value !== "string") return null
  if (value.length === 0) return new Uint8Array(0)
  let normalized = value.replaceAll("-", "+").replaceAll("_", "/")
  if (!STANDARD_B64.test(normalized)) return null
  while (normalized.length % 4 !== 0) normalized += "="
  try {
    const binary = atob(normalized)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return null
  }
}

/** Lowercase hex — used for credential secrets, which must not contain `_`. */
export function toHex(bytes: Uint8Array): string {
  let out = ""
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return out
}
