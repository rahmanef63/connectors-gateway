import { afterEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GatewayError } from "@cg/core"
import { loadConfig } from "./config"
import { PAIR_CLAIM_PATH, PAIR_START_PATH, pollDelay, runPairing } from "./pairing"
import { claimResponse, startResponse } from "./pairing-parse"
import type { FetchLike } from "./http"

const CREDENTIAL = "cgd_dev_1_secret_credential"
const GATEWAY_URL = "ws://localhost:8787/device"
const dirs: string[] = []

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "cg-agent-pair-"))
  dirs.push(dir)
  return dir
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })
}

const START_BODY = {
  challengeId: "pair_1",
  code: "ABCD2345",
  verificationUrl: "http://localhost:3000/pair?code=ABCD2345",
  expiresAt: Date.now() + 600_000,
}

const APPROVED_BODY = {
  status: "approved",
  deviceId: "dev_1",
  credential: CREDENTIAL,
  signingPublicKey: "MCowBQYDK2VwAyEAfake",
  keyId: "k1",
}

/** What apps/gateway actually returns: no status, no signing key. */
const GATEWAY_CLAIM_BODY = {
  deviceId: "dev_1",
  credential: CREDENTIAL,
  device: { id: "dev_1", displayName: "workstation", platform: "linux", status: "offline" },
}

type Call = { url: string; body: Record<string, unknown> }

function stubFetch(responses: Array<() => Response>): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = []
  let index = 0
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> })
    const next = responses[Math.min(index, responses.length - 1)]
    index += 1
    if (next === undefined) throw new Error("no response configured")
    return next()
  }
  return { fetchImpl, calls }
}

function options(fetchImpl: FetchLike, printed: string[]) {
  return {
    gatewayUrl: GATEWAY_URL,
    configDir: tempDir(),
    deviceName: "workstation",
    platform: "linux" as const,
    fetchImpl,
    print: (line: string) => void printed.push(line),
    sleep: async () => {},
    random: () => 0.5,
  }
}

describe("runPairing", () => {
  test("prints the code and the verification URL, then stores the credential", async () => {
    const printed: string[] = []
    const { fetchImpl, calls } = stubFetch([
      () => json(START_BODY),
      () => json({ status: "pending" }),
      () => json(APPROVED_BODY),
    ])
    const opts = options(fetchImpl, printed)
    const config = await runPairing(opts)

    expect(calls[0]?.url).toBe(`http://localhost:8787${PAIR_START_PATH}`)
    expect(calls[0]?.body).toEqual({ deviceName: "workstation", platform: "linux" })
    expect(calls[1]?.url).toBe(`http://localhost:8787${PAIR_CLAIM_PATH}`)
    expect(calls[1]?.body).toEqual({ challengeId: "pair_1", code: "ABCD2345" })

    const output = printed.join("\n")
    expect(output).toContain("ABCD2345")
    expect(output).toContain("http://localhost:3000/pair?code=ABCD2345")
    // The credential is stored, never shown (AGENTS.md invariant 4).
    expect(output).not.toContain(CREDENTIAL)

    expect(config.credential).toBe(CREDENTIAL)
    expect(loadConfig(opts.configDir).credential).toBe(CREDENTIAL)
    expect(loadConfig(opts.configDir).gatewayUrl).toBe(GATEWAY_URL)
  })

  test("an expired challenge stops the loop with NOT_AUTHORIZED", async () => {
    const { fetchImpl } = stubFetch([() => json(START_BODY), () => json({ status: "expired" })])
    await expect(runPairing(options(fetchImpl, []))).rejects.toThrow(GatewayError)
  })

  test("a transient network failure is retried, not fatal", async () => {
    let call = 0
    const fetchImpl: FetchLike = async (url) => {
      call += 1
      if (url.endsWith(PAIR_START_PATH)) return json(START_BODY)
      if (call === 2) throw new Error("ECONNRESET")
      return json(APPROVED_BODY)
    }
    const config = await runPairing(options(fetchImpl, []))
    expect(config.deviceId).toBe("dev_1")
  })

  test("gives up once the challenge TTL has passed", async () => {
    const { fetchImpl } = stubFetch([
      () => json({ ...START_BODY, expiresAt: Date.now() + 1 }),
      () => json({ status: "pending" }),
    ])
    let clock = Date.now()
    await expect(
      runPairing({ ...options(fetchImpl, []), now: () => (clock += 5_000) }),
    ).rejects.toThrow(GatewayError)
  })

  test("a non-2xx start response keeps the gateway's code but not its prose", async () => {
    const { fetchImpl } = stubFetch([
      () => json({ error: { code: "RATE_LIMITED", message: "slow down, dev_9 at 10.0.0.4" } }, 429),
    ])
    try {
      await runPairing(options(fetchImpl, []))
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("RATE_LIMITED")
      expect((cause as GatewayError).message).toContain("429")
      expect((cause as GatewayError).message).not.toContain("10.0.0.4")
    }
  })

  test("APPROVAL_REQUIRED means 'not approved yet', so polling continues", async () => {
    let call = 0
    const fetchImpl: FetchLike = async (url) => {
      call += 1
      if (url.endsWith(PAIR_START_PATH)) return json(START_BODY)
      // How the reference gateway reports pending / already-claimed / expired.
      if (call < 4) return json({ error: { code: "APPROVAL_REQUIRED", message: "not approved" } }, 409)
      return json(GATEWAY_CLAIM_BODY)
    }
    const config = await runPairing(options(fetchImpl, []))
    expect(config.deviceId).toBe("dev_1")
    expect(config.signingPublicKey).toBeUndefined()
  })

  test("the reference gateway's claim body (no status, no signing key) is accepted", async () => {
    const { fetchImpl } = stubFetch([() => json(START_BODY), () => json(GATEWAY_CLAIM_BODY)])
    const opts = options(fetchImpl, [])
    const config = await runPairing(opts)
    expect(config.credential).toBe(CREDENTIAL)
    expect(loadConfig(opts.configDir).keyId).toBeUndefined()
  })
})

describe("pairing response guards", () => {
  test("DENIED: a javascript: verification URL is never printed", () => {
    expect(() => startResponse({ ...START_BODY, verificationUrl: "javascript:alert(1)" })).toThrow(GatewayError)
    expect(() => startResponse({ ...START_BODY, verificationUrl: "file:///etc/passwd" })).toThrow(GatewayError)
  })

  test("DENIED: control characters in a printed field", () => {
    expect(() => startResponse({ ...START_BODY, code: `ABCD${String.fromCharCode(27)}[2J` })).toThrow(GatewayError)
  })

  test("DENIED: missing or malformed fields", () => {
    expect(() => startResponse({ ...START_BODY, expiresAt: "soon" })).toThrow(GatewayError)
    expect(() => startResponse({ ...START_BODY, challengeId: "" })).toThrow(GatewayError)
    expect(() => claimResponse({ status: "whatever" })).toThrow(GatewayError)
    expect(() => claimResponse({ status: "approved" })).toThrow(GatewayError)
  })

  test("an approval error message never echoes the credential", () => {
    try {
      claimResponse({ ...APPROVED_BODY, keyId: 7 })
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).message).not.toContain(CREDENTIAL)
    }
  })

  test("pending and expired carry no credential fields", () => {
    expect(claimResponse({ status: "pending" })).toEqual({ status: "pending" })
    expect(claimResponse({ status: "expired" })).toEqual({ status: "expired" })
  })
})

describe("pollDelay", () => {
  test("stays inside the pairing poll band", () => {
    for (let attempt = 1; attempt <= 20; attempt += 1) {
      const delay = pollDelay(attempt, () => 0.5)
      expect(delay).toBeGreaterThanOrEqual(2000)
      expect(delay).toBeLessThanOrEqual(10_000)
    }
  })
})
