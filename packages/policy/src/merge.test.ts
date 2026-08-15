import { describe, expect, test } from "bun:test"
import { POLICY_DECISIONS } from "@cg/core"
import type { PolicyDecision } from "@cg/core"
import { isPolicyDecision, mostRestrictive, rankDecision } from "./merge"

describe("mostRestrictive", () => {
  test("DENY beats REQUIRE_APPROVAL beats ALLOW", () => {
    expect(mostRestrictive("ALLOW", "REQUIRE_APPROVAL")).toBe("REQUIRE_APPROVAL")
    expect(mostRestrictive("REQUIRE_APPROVAL", "DENY")).toBe("DENY")
    expect(mostRestrictive("ALLOW", "DENY")).toBe("DENY")
    expect(mostRestrictive("ALLOW", "ALLOW")).toBe("ALLOW")
  })

  test("is commutative for every pair", () => {
    for (const a of POLICY_DECISIONS) {
      for (const b of POLICY_DECISIONS) {
        expect(mostRestrictive(a, b)).toBe(mostRestrictive(b, a))
      }
    }
  })

  test("is associative for every triple", () => {
    for (const a of POLICY_DECISIONS) {
      for (const b of POLICY_DECISIONS) {
        for (const c of POLICY_DECISIONS) {
          expect(mostRestrictive(mostRestrictive(a, b), c)).toBe(mostRestrictive(a, mostRestrictive(b, c)))
        }
      }
    }
  })

  test("single decision is returned unchanged", () => {
    for (const decision of POLICY_DECISIONS) expect(mostRestrictive(decision)).toBe(decision)
  })

  test("no decisions at all fails closed", () => {
    expect(mostRestrictive()).toBe("DENY")
  })

  test("an unreadable stored decision is treated as DENY, never as permission", () => {
    const forged = "allow" as PolicyDecision
    expect(mostRestrictive("ALLOW", forged)).toBe("DENY")
    expect(mostRestrictive(forged)).toBe("DENY")
  })

  test("docs/09: cloud ALLOW + local DISABLED = DENY", () => {
    expect(mostRestrictive("ALLOW", "DENY")).toBe("DENY")
  })
})

describe("isPolicyDecision / rankDecision", () => {
  test("accepts the vocabulary and rejects anything else", () => {
    for (const decision of POLICY_DECISIONS) expect(isPolicyDecision(decision)).toBe(true)
    for (const value of ["allow", "deny", "", null, undefined, 2, {}]) {
      expect(isPolicyDecision(value)).toBe(false)
    }
  })

  test("ranks unknown values at the DENY rank", () => {
    expect(rankDecision("ALLOW")).toBeLessThan(rankDecision("REQUIRE_APPROVAL"))
    expect(rankDecision("REQUIRE_APPROVAL")).toBeLessThan(rankDecision("DENY"))
    expect(rankDecision("deny" as PolicyDecision)).toBe(rankDecision("DENY"))
  })
})
