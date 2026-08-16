// @vitest-environment node
import { describe, expect, test } from "vitest"
import { ConvexError } from "convex/values"
import { ERROR_CODES } from "@cg/core"

import { API_KEYS_ERROR_COPY } from "../api-keys/labels"
import { resolveErrorMessage, type ErrorCopy } from "../convex-error"
import { CONNECTIONS_ERROR_COPY, CONNECT_ERRORS, type ConnectErrorCode } from "../connections/labels"

const SURFACES: ReadonlyArray<[string, ErrorCopy]> = [
  ["connections", CONNECTIONS_ERROR_COPY],
  ["api keys", API_KEYS_ERROR_COPY],
]

describe.each(SURFACES)("%s error copy", (_name, copy) => {
  test("every key is a real control-plane error code", () => {
    // convex/_shared/errors.ts draws its vocabulary from @cg/core ERROR_CODES,
    // so copy keyed by anything else could never be reached.
    for (const code of Object.keys(copy)) {
      if (code === "fallback") continue
      expect(ERROR_CODES as readonly string[]).toContain(code)
    }
  })

  test("every code the copy claims resolves to that sentence", () => {
    for (const [code, message] of Object.entries(copy)) {
      if (code === "fallback") continue
      expect(resolveErrorMessage(new ConvexError({ code }), copy)).toBe(message)
    }
  })

  test("the codes with no copy still say something", () => {
    for (const code of ERROR_CODES) {
      const shown = resolveErrorMessage(new ConvexError({ code }), copy)
      expect(shown.length).toBeGreaterThan(0)
    }
  })

  test("DENIED: no sentence is a bare error code", () => {
    for (const message of Object.values(copy)) {
      expect(message).not.toMatch(/^[A-Z_]+$/)
      expect(message.length).toBeGreaterThan(12)
    }
  })
})

describe("connect error copy", () => {
  /** Every code the connect actions and the OAuth callback can return. */
  const CODES: readonly ConnectErrorCode[] = [
    "not_signed_in",
    "sealing_unavailable",
    "unknown_connector",
    "client_id_required",
    "discovery_failed",
    "registration_failed",
    "start_failed",
    "secret_required",
    "save_failed",
    "flow_expired",
    "consent_denied",
    "state_mismatch",
    "exchange_failed",
  ]

  test("the map is exactly the code vocabulary — no gaps, no strays", () => {
    expect(Object.keys(CONNECT_ERRORS).sort()).toEqual([...CODES].sort())
  })

  test("every code has copy long enough to be an explanation", () => {
    for (const code of CODES) {
      expect(CONNECT_ERRORS[code].length).toBeGreaterThan(20)
    }
  })

  test("DENIED: nothing tells the user to go and run a CLI on the gateway host", () => {
    // The whole point of sealing server-side. If this string comes back, the
    // form has regressed to something only the operator can complete.
    for (const message of Object.values(CONNECT_ERRORS)) {
      expect(message).not.toMatch(/gateway host|bun run|ssh/i)
    }
  })

  test("the one operator-facing message names the missing variable", () => {
    // A deployment with no key cannot store credentials at all, and the person
    // who can fix that needs the variable's name, not "try again".
    expect(CONNECT_ERRORS.sealing_unavailable).toContain("CREDENTIAL_ENCRYPTION_KEY")
  })
})
