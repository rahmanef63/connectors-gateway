import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import type { ActionDefinition } from "@cg/core"
import type { AvailableIndex } from "./adapters"
import {
  FORBIDDEN_ACTION_TOKENS,
  assertLocallyAllowed,
  evaluateLocalAllowlist,
  isForbiddenActionId,
  mostRestrictive,
} from "./allowlist"

function action(overrides: Partial<ActionDefinition> = {}): ActionDefinition {
  return {
    id: "blender.scene.render",
    title: "Render",
    description: "Render the current scene.",
    inputSchema: { type: "object" },
    risk: "R2",
    annotations: { readOnly: false, destructive: false },
    requiredCapabilities: ["scene.render"],
    ...overrides,
  }
}

function available(capabilities: string[] = ["blender:scene.render"]): AvailableIndex {
  return { capabilities: new Set(capabilities), connectors: new Set(["blender"]) }
}

function input(overrides: Partial<Parameters<typeof evaluateLocalAllowlist>[0]> = {}) {
  return {
    connectorId: "blender",
    actionId: "blender.scene.render",
    action: action(),
    available: available(),
    disabledActions: [] as string[],
    ...overrides,
  }
}

describe("evaluateLocalAllowlist", () => {
  test("allows a known, available, low-risk action", () => {
    expect(evaluateLocalAllowlist(input())).toEqual({ decision: "ALLOW", reason: "allowed" })
  })

  test("DENIED: python / shell / filesystem action ids, even when the envelope was allowed", () => {
    for (const token of FORBIDDEN_ACTION_TOKENS) {
      const actionId = `blender.${token}.execute`
      const result = evaluateLocalAllowlist(
        input({
          actionId,
          // The gateway said yes: a full manifest entry, R0, capability announced.
          action: action({ id: actionId, risk: "R0", requiredCapabilities: [] }),
          available: { capabilities: new Set([`blender:${token}.execute`]), connectors: new Set(["blender"]) },
        }),
      )
      expect(result).toEqual({ decision: "DENY", reason: "forbidden_capability" })
    }
  })

  test("DENIED: a forbidden token anywhere in the id, including the connector", () => {
    expect(isForbiddenActionId("blender", "blender.scene.pythonRender")).toBe(true)
    expect(isForbiddenActionId("shell", "run")).toBe(true)
    expect(isForbiddenActionId("blender", "SCENE.PYTHON")).toBe(true)
    expect(isForbiddenActionId("blender", "scene.render")).toBe(false)
  })

  test("DENIED: an action that no registered adapter declares", () => {
    expect(evaluateLocalAllowlist(input({ action: undefined, actionId: "blender.scene.nuke" }))).toEqual({
      decision: "DENY",
      reason: "unknown_action",
    })
  })

  test("DENIED: a manifest entry whose id does not match the requested action", () => {
    const result = evaluateLocalAllowlist(input({ actionId: "blender.object.delete" }))
    expect(result.reason).toBe("unknown_action")
  })

  test("DENIED: the user disabled the action id locally (cloud ALLOW + local disabled)", () => {
    const result = evaluateLocalAllowlist(input({ disabledActions: ["blender.scene.render"] }))
    expect(result).toEqual({ decision: "DENY", reason: "user_disabled" })
  })

  test("DENIED: R4 and an unreadable risk class", () => {
    expect(evaluateLocalAllowlist(input({ action: action({ risk: "R4" }) })).reason).toBe("high_risk")
    const bogus = action({ risk: "R9" as ActionDefinition["risk"] })
    expect(evaluateLocalAllowlist(input({ action: bogus })).reason).toBe("high_risk")
  })

  test("DENIED: the required capability is not currently announced", () => {
    const result = evaluateLocalAllowlist(input({ available: { capabilities: new Set(), connectors: new Set() } }))
    expect(result).toEqual({ decision: "DENY", reason: "missing_capability" })
  })

  test("DENIED: a capability announced under another connector's namespace", () => {
    const result = evaluateLocalAllowlist(
      input({ available: { capabilities: new Set(["other:scene.render"]), connectors: new Set(["other"]) } }),
    )
    expect(result.reason).toBe("missing_capability")
  })

  test("DENIED: an action with no required capabilities whose connector is unavailable", () => {
    const bare = action({ requiredCapabilities: [] })
    const result = evaluateLocalAllowlist(
      input({ action: bare, available: { capabilities: new Set(), connectors: new Set() } }),
    )
    expect(result.reason).toBe("missing_capability")
  })

  test("an already-namespaced requiredCapability is not double-prefixed", () => {
    const qualified = action({ requiredCapabilities: ["blender:scene.render"] })
    expect(evaluateLocalAllowlist(input({ action: qualified })).decision).toBe("ALLOW")
  })
})

describe("assertLocallyAllowed", () => {
  test("throws NOT_AUTHORIZED and never echoes the action id", () => {
    let thrown: unknown
    try {
      assertLocallyAllowed(input({ actionId: "blender.python.execute", action: undefined }))
    } catch (cause) {
      thrown = cause
    }
    expect(thrown).toBeInstanceOf(GatewayError)
    expect((thrown as GatewayError).code).toBe("NOT_AUTHORIZED")
    expect((thrown as GatewayError).message).not.toContain("python")
  })

  test("returns silently when allowed", () => {
    expect(() => assertLocallyAllowed(input())).not.toThrow()
  })
})

describe("mostRestrictive", () => {
  test("cloud ALLOW + local DENY = DENY", () => {
    expect(mostRestrictive("ALLOW", "DENY")).toBe("DENY")
    expect(mostRestrictive("ALLOW", "REQUIRE_APPROVAL")).toBe("REQUIRE_APPROVAL")
    expect(mostRestrictive("ALLOW", "ALLOW")).toBe("ALLOW")
  })

  test("no decisions at all fails closed", () => {
    expect(mostRestrictive()).toBe("DENY")
  })
})
