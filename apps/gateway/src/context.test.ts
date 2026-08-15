import { describe, expect, test } from "bun:test"
import { silentLogger } from "./__tests__/fixtures"
import { createRequestScope, resolveRequestId, toRequestContext } from "./context"

describe("resolveRequestId", () => {
  test("accepts a well-formed inbound id", () => {
    expect(resolveRequestId("trace-42_A")).toBe("trace-42_A")
  })

  test("generates one when the header is missing", () => {
    expect(resolveRequestId(null)).toMatch(/^req_[0-9a-f]{32}$/)
    expect(resolveRequestId(undefined)).toMatch(/^req_/)
  })

  test("refuses anything that could poison a log line", () => {
    for (const hostile of ["<script>", 'a"b', "a\nb", "a b", "x".repeat(65), ""]) {
      expect(resolveRequestId(hostile)).toMatch(/^req_/)
    }
  })
})

describe("createRequestScope", () => {
  test("carries the resolved id and the received time", () => {
    const scope = createRequestScope(silentLogger, new Headers({ "x-request-id": "abc" }), 1_000)
    expect(scope.requestId).toBe("abc")
    expect(scope.receivedAt).toBe(1_000)
  })
})

describe("toRequestContext", () => {
  test("identity comes from the principal, never from the scope", () => {
    const scope = createRequestScope(silentLogger, new Headers(), 5)
    const context = toRequestContext(scope, {
      callerId: "key_1",
      userId: "usr_1",
      scopes: [],
    })
    expect(context.principal.userId).toBe("usr_1")
    expect(context.requestId).toBe(scope.requestId)
    expect(context.receivedAt).toBe(5)
  })
})
