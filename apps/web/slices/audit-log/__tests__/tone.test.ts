// @vitest-environment node
import { describe, expect, test } from "vitest"
import { EXECUTOR_KINDS, POLICY_DECISIONS } from "@cg/core"
import { POLICY_DECISION_TONES, TONES } from "@/components/status-badge"
import {
  DECISION_TONES,
  EXECUTOR_TONES,
  STATUS_TONES,
  toneForDecision,
  toneForExecutor,
  toneForStatus,
} from "../config/tone"
import { DEFAULT_AUDIT_LABELS } from "../config/labels"
import { AUDIT_STATUSES } from "../lib/format"

/**
 * Since 0.2.0 the slice names a TONE and the app resolves it to classes. These
 * tests pin the mapping and the fact that the slice owns no colour: every value
 * below is a member of the app's tone vocabulary, never a class or a hex.
 */

describe("decision → tone", () => {
  test("covers every policy decision from @cg/core", () => {
    expect(Object.keys(DECISION_TONES).sort()).toEqual([...POLICY_DECISIONS].sort())
    expect(Object.keys(DEFAULT_AUDIT_LABELS.decision).sort()).toEqual([...POLICY_DECISIONS].sort())
  })

  test("keeps the pinned mapping", () => {
    expect(toneForDecision("ALLOW")).toBe("success")
    expect(toneForDecision("DENY")).toBe("danger")
    expect(toneForDecision("REQUIRE_APPROVAL")).toBe("warning")
  })

  test("a denial never renders like an allow, or like an approval", () => {
    expect(toneForDecision("DENY")).not.toBe(toneForDecision("ALLOW"))
    expect(toneForDecision("DENY")).not.toBe(toneForDecision("REQUIRE_APPROVAL"))
  })

  test("agrees with the app's tone SSOT, so audit and policy screens match", () => {
    expect(DECISION_TONES).toEqual(POLICY_DECISION_TONES)
  })
})

describe("executor → tone", () => {
  test("covers every executor kind from @cg/core", () => {
    expect(Object.keys(EXECUTOR_TONES).sort()).toEqual([...EXECUTOR_KINDS].sort())
    expect(Object.keys(DEFAULT_AUDIT_LABELS.executor).sort()).toEqual([...EXECUTOR_KINDS].sort())
  })

  // Where an action ran is not a verdict: the label says cloud or local, the
  // colour says nothing. Toning one of them would read as a warning.
  test("every executor is neutral", () => {
    for (const executor of EXECUTOR_KINDS) expect(toneForExecutor(executor)).toBe("neutral")
  })
})

describe("status → tone", () => {
  test("covers every audit status", () => {
    expect(Object.keys(STATUS_TONES).sort()).toEqual([...AUDIT_STATUSES].sort())
  })

  test("an error never renders as a success", () => {
    expect(toneForStatus("error")).toBe("danger")
    expect(toneForStatus("success")).toBe("success")
  })
})

describe("tone tables", () => {
  test("are frozen so a consumer cannot repaint a security signal", () => {
    expect(Object.isFrozen(DECISION_TONES)).toBe(true)
    expect(Object.isFrozen(EXECUTOR_TONES)).toBe(true)
    expect(Object.isFrozen(STATUS_TONES)).toBe(true)
  })

  test("DENIED: the slice names tones only — never a class, never a colour", () => {
    for (const map of [DECISION_TONES, EXECUTOR_TONES, STATUS_TONES]) {
      for (const tone of Object.values(map)) {
        expect(TONES).toContain(tone)
        expect(tone).not.toMatch(/#|rgb|hsl|bg-|text-|border-/)
      }
    }
  })
})
