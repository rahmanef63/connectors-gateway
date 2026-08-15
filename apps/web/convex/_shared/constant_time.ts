/**
 * Constant-time string comparison for secret material.
 *
 * `node:crypto.timingSafeEqual` does not exist in the Convex runtime, so this
 * is the WebCrypto-era equivalent: fold the length difference into the
 * accumulator and walk the full max length with no early return.
 */

const encoder = new TextEncoder()

export function timingSafeEqual(a: string, b: string): boolean {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  // Length inequality is folded in rather than short-circuited, so the loop
  // length is the only thing an attacker can observe.
  let diff = left.length ^ right.length
  const length = Math.max(left.length, right.length)
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  }
  return diff === 0
}
