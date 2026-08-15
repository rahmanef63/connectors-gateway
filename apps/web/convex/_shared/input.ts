/**
 * Shape guards for values that arrive over the wire. `v.string()` proves the
 * type, not the bounds — an unbounded string is still an unbounded write.
 * No guard ever echoes the offending value back into the message.
 */
import {
  MAX_DISPLAY_NAME_LENGTH,
  MAX_IDENTIFIER_LENGTH,
  MAX_PAIRING_CODE_LENGTH,
  MIN_DISPLAY_NAME_LENGTH,
  MIN_PAIRING_CODE_LENGTH,
} from "./limits"
import { fail } from "./errors"

const IDENTIFIER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]*$/
const PAIRING_CODE_PATTERN = /^[A-Z0-9-]+$/
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/

/** Opaque gateway-minted ids: `dev_ab12…`, `pair_…`, `cgk`-key ids. */
export function assertIdentifier(value: string, label: string): string {
  if (
    value.length === 0 ||
    value.length > MAX_IDENTIFIER_LENGTH ||
    !IDENTIFIER_PATTERN.test(value)
  ) {
    fail("INVALID_INPUT", `${label} is not a valid identifier.`)
  }
  return value
}

export function assertDisplayName(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length < MIN_DISPLAY_NAME_LENGTH || trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    fail("INVALID_INPUT", "Display name must be 1-64 characters.")
  }
  // Control characters would corrupt any log line the name later lands in.
  if (CONTROL_CHARACTERS.test(trimmed)) {
    fail("INVALID_INPUT", "Display name contains unsupported characters.")
  }
  return trimmed
}

/** Pairing codes are typed by a human, so they normalize to upper case. */
export function assertPairingCode(value: string): string {
  const normalized = value.trim().toUpperCase()
  if (
    normalized.length < MIN_PAIRING_CODE_LENGTH ||
    normalized.length > MAX_PAIRING_CODE_LENGTH ||
    !PAIRING_CODE_PATTERN.test(normalized)
  ) {
    fail("INVALID_INPUT", "Pairing code is not valid.")
  }
  return normalized
}

export function assertFutureTimestamp(value: number, now: number): number {
  if (!Number.isFinite(value) || value <= now) {
    fail("INVALID_INPUT", "Expiry must be in the future.")
  }
  return value
}
