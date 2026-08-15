import { describe, expect, test } from "bun:test"
import { findAction } from "@cg/core"
import example from "../../../examples/careerpack.connector.json"
import { ACTION_APPLICATION_CREATE, ACTION_PROFILE_READ, manifest } from "./manifest"

describe("careerpack manifest", () => {
  test("is a cloud connector authenticated with a bearer token", () => {
    expect(manifest.id).toBe("careerpack")
    expect(manifest.executor).toBe("cloud")
    expect(manifest.auth.type).toBe("bearer")
  })

  test("declares exactly the two MVP actions", () => {
    expect(manifest.actions.map((action) => action.id)).toEqual([ACTION_PROFILE_READ, ACTION_APPLICATION_CREATE])
  })

  test("risk and annotations match examples/careerpack.connector.json", () => {
    for (const declared of example.actions) {
      const action = findAction(manifest, declared.id)
      expect(action).toBeDefined()
      expect(action?.risk as string | undefined).toBe(declared.risk)
      expect(action?.annotations).toEqual(declared.annotations)
      expect(action?.title).toBe(declared.title)
    }
  })

  test("every action carries an object JSON Schema", () => {
    for (const action of manifest.actions) {
      expect(action.inputSchema["type"]).toBe("object")
      expect(action.inputSchema["additionalProperties"]).toBe(false)
    }
  })

  test("the read action takes no required input and the write action requires role and company", () => {
    const read = findAction(manifest, ACTION_PROFILE_READ)
    expect(read?.inputSchema["required"]).toBeUndefined()

    const create = findAction(manifest, ACTION_APPLICATION_CREATE)
    expect(create?.inputSchema["required"]).toEqual(["role", "company"])
  })
})
