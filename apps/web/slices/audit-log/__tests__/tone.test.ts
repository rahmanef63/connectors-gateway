// @vitest-environment node
import { describe, expect, test } from "vitest"
import { EXECUTOR_KINDS, POLICY_DECISIONS } from "@cg/core"
import {
  DECISION_TONES,
  EXECUTOR_TONES,
  STATUS_TONES,
  TONE_BADGE_VARIANTS,
  badgeVariantForDecision,
  badgeVariantForExecutor,
  badgeVariantForStatus,
} from "../config/tone"
import { DEFAULT_AUDIT_LABELS } from "../config/labels"
import { AUDIT_STATUSES } from "../lib/format"

describe("decision → tone → variant", () => {
  test("covers every policy decision from @cg/core", () => {
    expect(Object.keys(DECISION_TONES).sort()).toEqual([...POLICY_DECISIONS].sort())
    expect(Object.keys(DEFAULT_AUDIT_LABELS.decision).sort()).toEqual([...POLICY_DECISIONS].sort())
  })

  test("a denial never renders with the same variant as an allow", () => {
    expect(badgeVariantForDecision("ALLOW")).not.toBe(badgeVariantForDecision("DENY"))
    expect(badgeVariantForDecision("REQUIRE_APPROVAL")).not.toBe(badgeVariantForDecision("DENY"))
    expect(badgeVariantForDecision("DENY")).toBe("destructive")
  })

  test("every decision resolves to a variant the badge understands", () => {
    for (const decision of POLICY_DECISIONS) {
      expect(Object.values(TONE_BADGE_VARIANTS)).toContain(badgeVariantForDecision(decision))
    }
  })
})

describe("executor → tone → variant", () => {
  test("covers every executor kind from @cg/core", () => {
    expect(Object.keys(EXECUTOR_TONES).sort()).toEqual([...EXECUTOR_KINDS].sort())
    expect(Object.keys(DEFAULT_AUDIT_LABELS.executor).sort()).toEqual([...EXECUTOR_KINDS].sort())
  })

  test("cloud and local are visually distinct", () => {
    expect(badgeVariantForExecutor("cloud")).not.toBe(badgeVariantForExecutor("local"))
  })
})

describe("status → tone → variant", () => {
  test("covers every audit status", () => {
    expect(Object.keys(STATUS_TONES).sort()).toEqual([...AUDIT_STATUSES].sort())
  })

  test("an error never renders as a success", () => {
    expect(badgeVariantForStatus("error")).toBe("destructive")
    expect(badgeVariantForStatus("success")).not.toBe(badgeVariantForStatus("error"))
  })
})

describe("tone tables", () => {
  test("are frozen so a consumer cannot repaint a security signal", () => {
    expect(Object.isFrozen(DECISION_TONES)).toBe(true)
    expect(Object.isFrozen(EXECUTOR_TONES)).toBe(true)
    expect(Object.isFrozen(STATUS_TONES)).toBe(true)
    expect(Object.isFrozen(TONE_BADGE_VARIANTS)).toBe(true)
  })

  test("every tone maps to a variant", () => {
    for (const tone of Object.values(DECISION_TONES)) expect(TONE_BADGE_VARIANTS[tone]).toBeTypeOf("string")
    for (const tone of Object.values(EXECUTOR_TONES)) expect(TONE_BADGE_VARIANTS[tone]).toBeTypeOf("string")
    for (const tone of Object.values(STATUS_TONES)) expect(TONE_BADGE_VARIANTS[tone]).toBeTypeOf("string")
  })
})
