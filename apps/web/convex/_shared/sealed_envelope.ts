/**
 * Shape validation for ciphertext produced by @cg/auth `seal`.
 *
 * Convex has no encryption key and cannot authenticate the GCM tag. This gate
 * only prevents plaintext or obviously malformed data from being persisted; the
 * gateway still performs the real authenticated open before use.
 */
import { fail } from "./errors"

const SEALED_PATTERN = /^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/
const MAX_SEALED_LENGTH = 64 * 1024

export function assertSealedEnvelope(value: string): string {
  if (value.length > MAX_SEALED_LENGTH || !SEALED_PATTERN.test(value)) {
    // Never echo the value: malformed input is still credential material.
    fail("INVALID_INPUT", "Credential is not a sealed envelope.")
  }
  return value
}
