import { describe, expect, test } from "bun:test"
import type { ControlPlaneClient } from "../store/client"
import { createDistributedRateLimiter, digestKey } from "./distributed-rate-limit"

describe("distributed rate limiter foundation", () => {
  test("hashes raw peer keys before they reach shared storage", async () => {
    const calls: Record<string, unknown>[] = []
    const client = {
      query: async () => null,
      mutation: async (_ref: unknown, args: Record<string, unknown>) => {
        calls.push(args)
        return { allowed: true, resetAt: 123 }
      },
    } as unknown as ControlPlaneClient
    const limiter = createDistributedRateLimiter(client, { bucket: "edge", limit: 120, windowMs: 60_000 })
    expect(await limiter.check("ws:203.0.113.9")).toBe(true)
    expect(calls[0]?.keyDigest).toBe(digestKey("ws:203.0.113.9"))
    expect(JSON.stringify(calls)).not.toContain("203.0.113.9")
  })

  test("fails closed on control-plane failure or malformed response", async () => {
    for (const mode of ["throw", "bad"] as const) {
      const client = {
        query: async () => null,
        mutation: async () => {
          if (mode === "throw") throw new Error("offline")
          return { allowed: "yes" }
        },
      } as unknown as ControlPlaneClient
      const limiter = createDistributedRateLimiter(client, { bucket: "oauth", limit: 20, windowMs: 60_000 })
      expect(await limiter.check("peer")).toBe(false)
    }
  })
})
