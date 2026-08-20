import { describe, expect, test } from "bun:test"
import { handleDiagnostics } from "./diagnostics"
import { recordCircuitTransientFailure, resetRemoteMcpReliabilityForTests, upstreamCircuitKey } from "../../../../../adapters/remote-mcp/src/reliability"

const TOKEN = "fixture-operator-token"

function context(auth?: string): any {
  return {
    request: new Request("https://connect.example.com/internal/diagnostics", { headers: auth ? { authorization: auth } : {} }),
    deps: { config: { serviceToken: TOKEN } }, scope: {}, params: {}, clientKey: "peer",
  }
}

describe("operator diagnostics", () => {
  test("fails closed without the service bearer", async () => {
    resetRemoteMcpReliabilityForTests()
    await expect(handleDiagnostics(context())).rejects.toMatchObject({ code: "NOT_AUTHENTICATED" })
  })

  test("returns bounded breaker metadata without URL or credential material", async () => {
    resetRemoteMcpReliabilityForTests()
    const url = "https://tenant-private-name.example.com/mcp"
    const key = upstreamCircuitKey("careerpack", url)
    recordCircuitTransientFailure("careerpack", key)
    const response = await handleDiagnostics(context(`Bearer ${TOKEN}`))
    const text = await response.text()
    expect(response.status).toBe(200)
    expect(text).toContain("careerpack")
    expect(text).not.toContain("tenant-private-name")
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain("https://")
  })
})
