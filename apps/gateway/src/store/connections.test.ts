import { describe, expect, test } from "bun:test"
import { encodeOAuthRenewal, type OAuthRenewal } from "@cg/core"
import { silentLogger } from "../__tests__/fixtures"
import type { ControlPlaneClient } from "./client"
import { createConnectionStore } from "./connections"
import { REFS } from "./refs"

const NOW = 1_700_000_000_000
const ACCESS_ONE = "sealed_access_one"
const ACCESS_TWO = "sealed_access_two"
const RENEWAL_ONE = "sealed_renewal_one"
const RENEWAL_TWO = "sealed_renewal_two"
const LEASE = "lease_test1234567890"

const renewal: OAuthRenewal = {
  v: 1,
  grantType: "refresh_token",
  tokenEndpoint: "https://auth.example.test/oauth/token",
  clientId: "client_1",
  clientSecret: null,
  refreshToken: "refresh_secret_1",
  scope: "mcp.read",
  resource: "https://api.example.test/mcp",
}

const expiring = {
  connectionId: "conn_1",
  baseUrl: "https://api.example.test/mcp",
  tokenCipher: ACCESS_ONE,
  tokenExpiresAt: NOW + 10_000,
  renewalCipher: RENEWAL_ONE,
  credentialVersion: 1,
}

const fresh = {
  ...expiring,
  tokenCipher: ACCESS_TWO,
  tokenExpiresAt: NOW + 3_600_000,
  credentialVersion: 2,
}

type Call = { kind: "query" | "mutation"; ref: unknown; args: Record<string, unknown> }

type Handlers = {
  query(ref: unknown, args: Record<string, unknown>): Promise<unknown>
  mutation(ref: unknown, args: Record<string, unknown>): Promise<unknown>
}

function fakeClient(calls: Call[], handlers: Handlers): ControlPlaneClient {
  return {
    query: async (ref, args) => {
      calls.push({ kind: "query", ref, args })
      return handlers.query(ref, args)
    },
    mutation: async (ref, args) => {
      calls.push({ kind: "mutation", ref, args })
      return handlers.mutation(ref, args)
    },
  } as ControlPlaneClient
}

function options(overrides: Partial<Parameters<typeof createConnectionStore>[1]> = {}) {
  return {
    openCredential: async (ciphertext: string) => {
      if (ciphertext !== RENEWAL_ONE) throw new Error("wrong envelope")
      return encodeOAuthRenewal(renewal)
    },
    sealCredential: async (plaintext: string) =>
      plaintext.startsWith("{") ? RENEWAL_TWO : ACCESS_TWO,
    logger: silentLogger,
    now: () => NOW,
    sleep: async () => {},
    newLeaseId: () => LEASE,
    ...overrides,
  }
}

function tokenResponse(document: unknown, status = 200): Response {
  return new Response(JSON.stringify(document), { status })
}

describe("createConnectionStore OAuth renewal", () => {
  test("returns a distant or non-expiring sealed token without a mutation", async () => {
    const calls: Call[] = []
    const client = fakeClient(calls, {
      query: async () => fresh,
      mutation: async () => {
        throw new Error("should not mutate")
      },
    })
    const store = createConnectionStore(client, options())

    await expect(store.resolveCredential("usr_1", "careerpack")).resolves.toEqual({
      connectionId: "conn_1",
      baseUrl: fresh.baseUrl,
      token: ACCESS_TWO,
    })
    expect(calls.map((call) => call.kind)).toEqual(["query"])
  })

  test("wins a lease, rotates both sealed documents, and returns only ciphertext", async () => {
    const calls: Call[] = []
    const sealedPlaintexts: string[] = []
    const client = fakeClient(calls, {
      query: async () => expiring,
      mutation: async (ref) => {
        if (ref === REFS.connectionsBeginRefresh) return { state: "refresh", credential: expiring }
        if (ref === REFS.connectionsFinishRefresh) return { updated: true }
        throw new Error("unexpected mutation")
      },
    })
    const store = createConnectionStore(
      client,
      options({
        sealCredential: async (plaintext) => {
          sealedPlaintexts.push(plaintext)
          return plaintext.startsWith("{") ? RENEWAL_TWO : ACCESS_TWO
        },
        fetcher: async () =>
          tokenResponse({
            access_token: "access_secret_2",
            expires_in: 3_600,
            refresh_token: "refresh_secret_2",
          }),
      }),
    )

    const result = await store.resolveCredential("usr_1", "careerpack")

    expect(result).toEqual({ connectionId: "conn_1", baseUrl: expiring.baseUrl, token: ACCESS_TWO })
    expect(sealedPlaintexts[0]).toBe("access_secret_2")
    expect(sealedPlaintexts[1]).toContain("refresh_secret_2")
    const finish = calls.find((call) => call.ref === REFS.connectionsFinishRefresh)
    expect(finish?.args).toMatchObject({
      connectionId: "conn_1",
      expectedVersion: 1,
      leaseId: LEASE,
      tokenCipher: ACCESS_TWO,
      renewalCipher: RENEWAL_TWO,
      tokenExpiresAt: NOW + 3_600_000,
    })
    expect(JSON.stringify(finish?.args)).not.toContain("access_secret_2")
    expect(JSON.stringify(finish?.args)).not.toContain("refresh_secret_2")
  })

  test("deduplicates simultaneous refreshes inside one gateway process", async () => {
    const calls: Call[] = []
    let release: (() => void) | undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const client = fakeClient(calls, {
      query: async () => expiring,
      mutation: async (ref) => {
        if (ref === REFS.connectionsBeginRefresh) return { state: "refresh", credential: expiring }
        if (ref === REFS.connectionsFinishRefresh) return { updated: true }
        throw new Error("unexpected mutation")
      },
    })
    const store = createConnectionStore(
      client,
      options({
        fetcher: async () => {
          await gate
          return tokenResponse({ access_token: "access_secret_2", expires_in: 3600 })
        },
      }),
    )

    const first = store.resolveCredential("usr_1", "careerpack")
    const second = store.resolveCredential("usr_1", "careerpack")
    await Promise.resolve()
    release?.()
    const [a, b] = await Promise.all([first, second])

    expect(a).toEqual(b)
    expect(calls.filter((call) => call.ref === REFS.connectionsBeginRefresh)).toHaveLength(1)
    expect(calls.filter((call) => call.ref === REFS.connectionsFinishRefresh)).toHaveLength(1)
  })

  test("waits for another instance and consumes its freshly committed token", async () => {
    const calls: Call[] = []
    let queryCount = 0
    const sleeps: number[] = []
    const client = fakeClient(calls, {
      query: async () => (++queryCount === 1 ? expiring : fresh),
      mutation: async (ref) => {
        if (ref === REFS.connectionsBeginRefresh) return { state: "wait", retryAfterMs: 5_000 }
        throw new Error("unexpected mutation")
      },
    })
    const store = createConnectionStore(
      client,
      options({ sleep: async (ms) => void sleeps.push(ms) }),
    )

    await expect(store.resolveCredential("usr_1", "careerpack")).resolves.toMatchObject({
      token: ACCESS_TWO,
    })
    expect(sleeps).toEqual([1_000])
    expect(calls.some((call) => call.ref === REFS.connectionsFinishRefresh)).toBe(false)
  })

  test("invalid_grant expires the connection, while a server outage stays retryable", async () => {
    const permanentCalls: Call[] = []
    const permanentClient = fakeClient(permanentCalls, {
      query: async () => expiring,
      mutation: async (ref) => {
        if (ref === REFS.connectionsBeginRefresh) return { state: "refresh", credential: expiring }
        if (ref === REFS.connectionsAbortRefresh) return { updated: true }
        throw new Error("unexpected mutation")
      },
    })
    const permanentStore = createConnectionStore(
      permanentClient,
      options({ fetcher: async () => tokenResponse({ error: "invalid_grant" }, 400) }),
    )
    await expect(permanentStore.resolveCredential("usr_1", "careerpack")).resolves.toBeNull()
    expect(
      permanentCalls.find((call) => call.ref === REFS.connectionsAbortRefresh)?.args.permanent,
    ).toBe(true)

    const transientCalls: Call[] = []
    const transientClient = fakeClient(transientCalls, {
      query: async () => expiring,
      mutation: async (ref) => {
        if (ref === REFS.connectionsBeginRefresh) return { state: "refresh", credential: expiring }
        if (ref === REFS.connectionsAbortRefresh) return { updated: true }
        throw new Error("unexpected mutation")
      },
    })
    const transientStore = createConnectionStore(
      transientClient,
      options({ fetcher: async () => tokenResponse({ error: "server_error" }, 503) }),
    )
    await expect(transientStore.resolveCredential("usr_1", "careerpack")).rejects.toMatchObject({
      code: "UPSTREAM_ERROR",
    })
    expect(
      transientCalls.find((call) => call.ref === REFS.connectionsAbortRefresh)?.args.permanent,
    ).toBe(false)
  })

  test("a decrypted renewal document with the wrong shape is terminal but never executed", async () => {
    const calls: Call[] = []
    let fetched = false
    const client = fakeClient(calls, {
      query: async () => expiring,
      mutation: async (ref) => {
        if (ref === REFS.connectionsBeginRefresh) return { state: "refresh", credential: expiring }
        if (ref === REFS.connectionsAbortRefresh) return { updated: true }
        throw new Error("unexpected mutation")
      },
    })
    const store = createConnectionStore(
      client,
      options({
        openCredential: async () => "not a renewal document",
        fetcher: async () => {
          fetched = true
          return tokenResponse({ access_token: "should_not_happen" })
        },
      }),
    )

    await expect(store.resolveCredential("usr_1", "careerpack")).resolves.toBeNull()
    expect(fetched).toBe(false)
    expect(calls.find((call) => call.ref === REFS.connectionsAbortRefresh)?.args.permanent).toBe(true)
  })
})
