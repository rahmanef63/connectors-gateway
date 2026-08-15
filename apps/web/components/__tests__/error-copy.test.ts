// @vitest-environment node
import { describe, expect, test } from "vitest"
import { ConvexError } from "convex/values"
import { ERROR_CODES } from "@cg/core"

import { API_KEYS_ERROR_COPY } from "../api-keys/labels"
import { resolveErrorMessage, type ErrorCopy } from "../convex-error"
import { CONNECTIONS_ERROR_COPY, FIELD_ISSUE_COPY, SEAL_COMMAND } from "../connections/labels"
import { validateBaseUrl, validateConnectionForm, type FieldIssue } from "../connections/validate"

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

describe("field issue copy", () => {
  /** Every issue the validators can produce, listed once. */
  const ISSUES: readonly FieldIssue[] = [
    "connector_empty",
    "connector_shape",
    "url_empty",
    "url_invalid",
    "url_scheme",
    "url_credentials",
    "url_unreachable",
    "url_port",
    "url_self",
    "token_empty",
    "token_not_sealed",
  ]

  test("the map is exactly the issue vocabulary — no gaps, no strays", () => {
    expect(Object.keys(FIELD_ISSUE_COPY).sort()).toEqual([...ISSUES].sort())
  })

  test("the unreachable-host case reads as a sentence, not a stack trace", () => {
    const result = validateBaseUrl("https://192.168.1.10")
    expect(result.ok).toBe(false)
    const copy = FIELD_ISSUE_COPY.url_unreachable
    expect(copy).toContain("not reachable from the gateway")
    expect(copy).not.toMatch(/[A-Z_]{6,}/) // no INVALID_INPUT leaking through
  })

  test("the raw-token case names the command that produces a sealed value", () => {
    const result = validateConnectionForm({
      connectorId: "careerpack",
      baseUrl: "https://careerpack.example.com",
      tokenCipher: "sk-live-not-sealed",
    })
    expect(result).toEqual({ ok: false, field: "tokenCipher", issue: "token_not_sealed" })
    expect(FIELD_ISSUE_COPY.token_not_sealed).toContain(SEAL_COMMAND)
  })

  test("every issue has copy long enough to be an explanation", () => {
    for (const issue of ISSUES) {
      expect(FIELD_ISSUE_COPY[issue].length).toBeGreaterThan(20)
    }
  })
})
