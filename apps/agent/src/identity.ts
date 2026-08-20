/**
 * Who this agent says it is: version, platform, default device name.
 * Everything here is announced in `hello`, so it must never carry a secret.
 */
import { hostname } from "node:os"
import { GatewayError, type DevicePlatform } from "@cg/core"

/** Announced in `hello`. Kept in sync with apps/agent/package.json by hand. */
export const AGENT_VERSION = "0.4.0"

const MAX_DEVICE_NAME_LENGTH = 64
const FALLBACK_DEVICE_NAME = "connectors-agent"
const DEL_CHAR_CODE = 0x7f
const FIRST_PRINTABLE_CHAR_CODE = 0x20
/** Mirrors the device-name charset the gateway accepts (apps/gateway pair/start). */
const DEVICE_NAME_DISALLOWED = /[^\w .()-]/g

/** node/bun `process.platform` -> the three platforms the control plane knows. */
export function detectPlatform(platform: string = process.platform): DevicePlatform {
  if (platform === "win32") return "windows"
  if (platform === "darwin") return "macos"
  if (platform === "linux") return "linux"
  // Unknown platforms (freebsd, aix, ...) have no device record shape yet.
  throw new GatewayError("INVALID_INPUT", "This operating system is not supported by the agent.")
}

/**
 * The machine hostname is the most useful default label for a device list.
 * It is user-visible metadata, not a secret — but it is still narrowed to the
 * charset the gateway accepts, so a hostile hostname cannot inject control
 * characters into a dashboard or a log line.
 */
export function defaultDeviceName(raw: string = safeHostname()): string {
  const cleaned = stripControlChars(raw)
    .replace(DEVICE_NAME_DISALLOWED, "")
    .trim()
    .slice(0, MAX_DEVICE_NAME_LENGTH)
  return cleaned.length > 0 ? cleaned : FALLBACK_DEVICE_NAME
}

export function stripControlChars(text: string): string {
  let out = ""
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i)
    if (code >= FIRST_PRINTABLE_CHAR_CODE && code !== DEL_CHAR_CODE) out += text[i]
  }
  return out
}

function safeHostname(): string {
  try {
    return hostname()
  } catch {
    return FALLBACK_DEVICE_NAME
  }
}
