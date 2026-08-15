import { describe, expect, test } from "bun:test"
import type { PolicyRule } from "@cg/core"
import { matchRule, WILDCARD_ACTION } from "./rules"

const rule = (connectorId: string, actionId: string, decision: PolicyRule["decision"]): PolicyRule => ({
  connectorId,
  actionId,
  decision,
})

describe("matchRule", () => {
  test("returns undefined when nothing matches", () => {
    expect(matchRule([], "blender", "scene.render")).toBeUndefined()
    expect(matchRule([rule("careerpack", "*", "DENY")], "blender", "scene.render")).toBeUndefined()
  })

  test("exact action rule beats the wildcard rule", () => {
    const rules = [rule("blender", WILDCARD_ACTION, "DENY"), rule("blender", "scene.render", "ALLOW")]
    expect(matchRule(rules, "blender", "scene.render")?.decision).toBe("ALLOW")
  })

  test("exact wins regardless of declaration order", () => {
    const rules = [rule("blender", "scene.render", "ALLOW"), rule("blender", WILDCARD_ACTION, "DENY")]
    expect(matchRule(rules, "blender", "scene.render")?.decision).toBe("ALLOW")
  })

  test("wildcard applies when there is no exact rule", () => {
    const rules = [rule("blender", WILDCARD_ACTION, "REQUIRE_APPROVAL"), rule("blender", "scene.render", "ALLOW")]
    expect(matchRule(rules, "blender", "object.delete")?.decision).toBe("REQUIRE_APPROVAL")
  })

  test("ties inside a tier resolve to the most restrictive rule, either order", () => {
    const forwards = [rule("blender", "object.delete", "ALLOW"), rule("blender", "object.delete", "DENY")]
    const backwards = [rule("blender", "object.delete", "DENY"), rule("blender", "object.delete", "ALLOW")]
    expect(matchRule(forwards, "blender", "object.delete")?.decision).toBe("DENY")
    expect(matchRule(backwards, "blender", "object.delete")?.decision).toBe("DENY")
  })

  test("a later rule never silently overrides an earlier, more restrictive one", () => {
    const rules = [rule("blender", WILDCARD_ACTION, "DENY"), rule("blender", WILDCARD_ACTION, "ALLOW")]
    expect(matchRule(rules, "blender", "python.execute")?.decision).toBe("DENY")
  })

  test("rules for another connector are ignored", () => {
    const rules = [rule("careerpack", "scene.render", "DENY"), rule("blender", "scene.render", "ALLOW")]
    expect(matchRule(rules, "blender", "scene.render")?.decision).toBe("ALLOW")
  })

  test("malformed stored entries are discarded, valid ones still apply", () => {
    const rules = [
      null,
      "deny",
      { connectorId: "blender" },
      { connectorId: "blender", actionId: 7, decision: "DENY" },
      rule("blender", "scene.render", "REQUIRE_APPROVAL"),
    ] as unknown as PolicyRule[]
    expect(matchRule(rules, "blender", "scene.render")?.decision).toBe("REQUIRE_APPROVAL")
  })

  test("a non-array rule set does not throw", () => {
    expect(matchRule(undefined as unknown as PolicyRule[], "blender", "scene.render")).toBeUndefined()
  })
})
