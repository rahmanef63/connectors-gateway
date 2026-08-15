import { describe, expect, test } from "bun:test"
import { findAction } from "@cg/core"
import example from "../../../examples/careerpack.connector.json"
import { ACTION_APPLICATION_CREATE, ACTION_PROFILE_READ, APPLICATION_STATUSES, manifest } from "./manifest"

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

  /**
   * The upstream assertions below are the point of this file. They are transcribed from
   * CareerPack's own tool definitions (convex/mcp/tools/profile.ts, .../applications.ts);
   * a manifest that drifts from them produces a call the live server rejects, which is
   * exactly the bug this connector shipped with.
   */
  test("profile_get takes no arguments at all", () => {
    const read = findAction(manifest, ACTION_PROFILE_READ)
    expect(read?.inputSchema["properties"]).toEqual({})
    expect(read?.inputSchema["required"]).toBeUndefined()
  })

  test("applications_create requires exactly upstream's four fields", () => {
    const create = findAction(manifest, ACTION_APPLICATION_CREATE)
    expect(create?.inputSchema["required"]).toEqual(["company", "position", "location", "source"])
  })

  test("applications_create accepts exactly upstream's properties — `position`, never `role`", () => {
    const create = findAction(manifest, ACTION_APPLICATION_CREATE)
    const properties = create?.inputSchema["properties"] as Record<string, unknown>
    expect(Object.keys(properties).sort()).toEqual(
      ["company", "cv_id", "location", "notes", "position", "salary", "source", "status"].sort(),
    )
    expect(properties["role"]).toBeUndefined()
  })

  test("the status enum is upstream's whitelist, not a rewritten one", () => {
    const create = findAction(manifest, ACTION_APPLICATION_CREATE)
    const properties = create?.inputSchema["properties"] as Record<string, Record<string, unknown>>
    expect(properties["status"]?.["enum"]).toEqual([
      "applied",
      "screening",
      "interview",
      "offer",
      "rejected",
      "withdrawn",
      "accepted",
    ])
    expect(APPLICATION_STATUSES).toEqual(properties["status"]?.["enum"] as typeof APPLICATION_STATUSES)
  })

  test("every property carries the description a model reads before calling", () => {
    const create = findAction(manifest, ACTION_APPLICATION_CREATE)
    const properties = create?.inputSchema["properties"] as Record<string, Record<string, unknown>>
    for (const [name, schema] of Object.entries(properties)) {
      expect(typeof schema["description"], `${name} needs a description`).toBe("string")
    }
  })
})
