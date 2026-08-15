import { describe, expect, test } from "bun:test"
import type { ActionDefinition, ConnectorManifest, PolicyRule } from "@cg/core"
import { evaluatePolicy } from "./evaluate"
import { POLICY_REASONS } from "./types"
import type { PolicyInput } from "./types"

const defineAction = (overrides: Partial<ActionDefinition> & { id: string }): ActionDefinition => ({
  title: overrides.id,
  description: overrides.id,
  inputSchema: {},
  risk: "R0",
  annotations: { readOnly: true, destructive: false },
  ...overrides,
})

const inspect = defineAction({ id: "scene.inspect", risk: "R0" })
const render = defineAction({
  id: "scene.render",
  risk: "R2",
  annotations: { readOnly: false, destructive: false },
  requiredCapabilities: ["scene.render"],
})
const remove = defineAction({
  id: "object.delete",
  risk: "R3",
  annotations: { readOnly: false, destructive: true },
})
const python = defineAction({
  id: "python.execute",
  risk: "R4",
  annotations: { readOnly: false, destructive: true },
  requiredScopes: ["blender:execute"],
  requiredCapabilities: ["python.execute"],
})
const broken = defineAction({ id: "scene.broken", risk: "R9" as ActionDefinition["risk"] })

const blender: ConnectorManifest = {
  id: "blender",
  name: "Blender",
  version: "0.1.0",
  executor: "local",
  auth: { type: "device" },
  actions: [inspect, render, remove, python, broken],
}

const rule = (actionId: string, decision: PolicyRule["decision"]): PolicyRule => ({
  connectorId: "blender",
  actionId,
  decision,
})

const evaluate = (overrides: Partial<PolicyInput> & { action: ActionDefinition }) =>
  evaluatePolicy({
    connector: blender,
    rules: [],
    scopes: ["blender:execute"],
    deviceCapabilities: ["blender:scene.render", "blender:python.execute"],
    ...overrides,
  })

describe("evaluatePolicy — risk baseline", () => {
  test("R0 allows with no rules", () => {
    expect(evaluate({ action: inspect })).toEqual({ decision: "ALLOW", reason: "risk_default" })
  })

  test("R2 and R3 default to REQUIRE_APPROVAL", () => {
    expect(evaluate({ action: render }).decision).toBe("REQUIRE_APPROVAL")
    expect(evaluate({ action: remove }).decision).toBe("REQUIRE_APPROVAL")
  })

  test("R4 defaults to DENY", () => {
    expect(evaluate({ action: python })).toMatchObject({ decision: "DENY", reason: "risk_default" })
  })

  test("an unknown risk class fails closed", () => {
    expect(evaluate({ action: broken })).toEqual({ decision: "DENY", reason: "invalid_risk" })
  })
})

describe("evaluatePolicy — AGENTS.md invariant 7", () => {
  test("an explicit ALLOW rule cannot raise a default-DENY R4 action above DENY", () => {
    const result = evaluate({ action: python, rules: [rule("python.execute", "ALLOW")] })
    expect(result.decision).toBe("DENY")
    expect(result.reason).toBe("risk_default")
    expect(result.matchedRule).toEqual(rule("python.execute", "ALLOW"))
  })

  test("a wildcard ALLOW rule cannot raise R4 either", () => {
    expect(evaluate({ action: python, rules: [rule("*", "ALLOW")] }).decision).toBe("DENY")
  })

  test("an explicit REQUIRE_APPROVAL rule still cannot soften R4", () => {
    expect(evaluate({ action: python, rules: [rule("python.execute", "REQUIRE_APPROVAL")] }).decision).toBe("DENY")
  })

  test("a caller-supplied action definition cannot downgrade the manifest risk", () => {
    const forged = { ...python, risk: "R0" as const, requiredScopes: [], requiredCapabilities: [] }
    expect(evaluate({ action: forged, rules: [rule("python.execute", "ALLOW")] }).decision).toBe("DENY")
  })
})

describe("evaluatePolicy — rules", () => {
  test("a rule can only tighten: R0 + DENY rule = DENY", () => {
    const result = evaluate({ action: inspect, rules: [rule("scene.inspect", "DENY")] })
    expect(result).toMatchObject({ decision: "DENY", reason: "explicit_rule" })
  })

  test("R0 + REQUIRE_APPROVAL rule = REQUIRE_APPROVAL", () => {
    expect(evaluate({ action: inspect, rules: [rule("*", "REQUIRE_APPROVAL")] }).decision).toBe("REQUIRE_APPROVAL")
  })

  test("an ALLOW rule matching an already-ALLOW baseline stays ALLOW", () => {
    expect(evaluate({ action: inspect, rules: [rule("scene.inspect", "ALLOW")] })).toMatchObject({
      decision: "ALLOW",
      reason: "explicit_rule",
    })
  })

  test("exact action rule beats the wildcard rule", () => {
    const rules = [rule("*", "DENY"), rule("object.delete", "REQUIRE_APPROVAL")]
    expect(evaluate({ action: remove, rules }).decision).toBe("REQUIRE_APPROVAL")
    expect(evaluate({ action: inspect, rules }).decision).toBe("DENY")
  })

  test("rules belonging to another connector are ignored", () => {
    const foreign: PolicyRule = { connectorId: "careerpack", actionId: "*", decision: "DENY" }
    expect(evaluate({ action: inspect, rules: [foreign] }).decision).toBe("ALLOW")
  })
})

describe("evaluatePolicy — prerequisites", () => {
  test("missing scope denies before anything else is considered", () => {
    const result = evaluate({ action: python, scopes: [], rules: [rule("python.execute", "ALLOW")] })
    expect(result).toEqual({ decision: "DENY", reason: "missing_scope" })
  })

  test("missing capability denies", () => {
    const result = evaluate({ action: python, deviceCapabilities: ["blender:scene.render"] })
    expect(result).toEqual({ decision: "DENY", reason: "missing_capability" })
  })

  test("no device report at all denies a capability-gated action", () => {
    const result = evaluatePolicy({ connector: blender, action: render, rules: [], scopes: [] })
    expect(result).toEqual({ decision: "DENY", reason: "missing_capability" })
  })

  test("an action not present in the manifest is denied", () => {
    const ghost = defineAction({ id: "scene.ghost", risk: "R0" })
    expect(evaluate({ action: ghost })).toEqual({ decision: "DENY", reason: "unknown_action" })
  })

  test("docs/09: cloud policy says ALLOW, local device has the capability disabled = DENY", () => {
    const result = evaluate({
      action: render,
      rules: [rule("scene.render", "ALLOW")],
      deviceCapabilities: [],
    })
    expect(result).toEqual({ decision: "DENY", reason: "missing_capability" })
  })
})

describe("evaluatePolicy — audit safety", () => {
  test("every reason it can emit is part of the closed vocabulary", () => {
    const cases = [
      evaluate({ action: inspect }),
      evaluate({ action: inspect, rules: [rule("*", "DENY")] }),
      evaluate({ action: python, rules: [rule("*", "ALLOW")] }),
      evaluate({ action: python, scopes: [] }),
      evaluate({ action: python, deviceCapabilities: [] }),
      evaluate({ action: broken }),
      evaluate({ action: defineAction({ id: "nope" }) }),
    ]
    for (const result of cases) {
      expect(POLICY_REASONS).toContain(result.reason)
      expect(result.reason).not.toContain(" ")
    }
  })
})
