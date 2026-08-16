import { describe, expect, test } from "vitest"
import { collectCredential } from "./credential-fields"

const form = (values: Record<string, string>): FormData => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(values)) fd.set(k, v)
  return fd
}

describe("collectCredential — the connector says what to ask for", () => {
  test("composio connects on the API key alone", () => {
    // The point of declaring fields: Composio needs one value, and a form
    // fixed at two would send the user hunting for one it never wanted.
    const got = collectCredential("composio", form({ apiKey: "ak_live" }))
    expect(got.missing).toBeNull()
    expect(got.secret).toBe("ak_live")
  })

  test("an address field is pulled OUT of the credential, not sealed with it", () => {
    // Sealed inside the token blob, the executor could not read it and nobody
    // would think to look there for a URL.
    const got = collectCredential(
      "composio",
      form({ apiKey: "ak_live", serverUrl: "https://backend.composio.dev/v3/mcp/s?user_id=u" }),
    )
    expect(got.endpoint).toBe("https://backend.composio.dev/v3/mcp/s?user_id=u")
    expect(got.secret).toBe("ak_live")
    expect(got.secret).not.toContain("composio.dev")
  })

  test("reports a missing REQUIRED field, ignores an omitted optional one", () => {
    expect(collectCredential("composio", form({})).missing).toBe("apiKey")
    expect(collectCredential("composio", form({ apiKey: "k" })).missing).toBeNull()
  })

  test("two credential fields are sealed together", () => {
    const got = collectCredential("careerpack", form({ clientId: "cp_1", clientSecret: "s3cr3t" }))
    expect(got.missing).toBeNull()
    expect(JSON.parse(got.secret)).toEqual({ clientId: "cp_1", clientSecret: "s3cr3t" })
  })

  test("one field stays a bare string, so existing rows keep their shape at rest", () => {
    expect(() => JSON.parse(collectCredential("composio", form({ apiKey: "ak" })).secret)).toThrow()
  })

  test("an unknown connector falls back to the single-secret form", () => {
    expect(collectCredential("nope", form({ secret: "s" })).secret).toBe("s")
    expect(collectCredential("nope", form({})).missing).toBe("secret")
  })
})
