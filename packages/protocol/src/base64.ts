/**
 * Base64 / base64url codecs for key material and signatures.
 * Internal to @cg/protocol: keys are base64 (pkcs8/spki), signatures base64url.
 */
import { GatewayError } from "@cg/core"

const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/
const BASE64URL_RE = /^[A-Za-z0-9\-_]*$/

export function toBase64(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ""
  for (const byte of view) binary += String.fromCharCode(byte)
  return btoa(binary)
}

/** Strict: rejects whitespace and non-alphabet characters that `atob` tolerates. */
export function fromBase64(text: string, what: string): Uint8Array {
  if (text.length === 0 || text.length % 4 !== 0 || !BASE64_RE.test(text)) {
    throw new GatewayError("INVALID_INPUT", `${what} is not valid base64.`)
  }
  return decode(text, what)
}

export function toBase64Url(bytes: ArrayBuffer | Uint8Array): string {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "")
}

export function fromBase64Url(text: string, what: string): Uint8Array {
  if (text.length === 0 || text.length % 4 === 1 || !BASE64URL_RE.test(text)) {
    throw new GatewayError("INVALID_INPUT", `${what} is not valid base64url.`)
  }
  const padded = text.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(text.length / 4) * 4, "=")
  return decode(padded, what)
}

function decode(text: string, what: string): Uint8Array {
  let binary: string
  try {
    binary = atob(text)
  } catch {
    // Never echo the input back: it may be key material.
    throw new GatewayError("INVALID_INPUT", `${what} is not valid base64.`)
  }
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}
