/**
 * The OAuth authorization server, end to end — docs/18-oauth.md.
 *
 * These tests are the authority on the security properties of the flow, so
 * most of them assert a REFUSAL. The happy path is one test; the rest are the
 * ways a code must not be redeemable.
 */
import { describe, expect, test } from "vitest"
import { SCOPE_READ, grantedScopes } from "@cg/core"
import { api } from "../_generated/api"
import { deriveCodeChallenge } from "../_shared/code_hash"
import {
  asUser,
  createUser,
  expectRejected,
  setupConvex,
  SERVICE_TOKEN,
  WRONG_SERVICE_TOKEN,
  type TestClient,
} from "../test.helpers"

const REDIRECT = "https://claude.ai/api/mcp/auth_callback"
const RESOURCE = "https://connect.rahmanef.com/mcp"
const ISSUER = "https://connect.rahmanef.com"
/** 43+ chars from the unreserved set, per RFC 7636 §4.1. */
const VERIFIER = "a".repeat(64)

async function register(t: TestClient, redirectUris = [REDIRECT]) {
  return await t.mutation(api.service.oauth.registerClient, {
    serviceToken: SERVICE_TOKEN,
    clientName: "Claude",
    redirectUris,
    applicationType: "web",
    issuer: ISSUER,
  })
}

/** Registers a client and walks a signed-in user through consent. */
async function grantCode(
  t: TestClient,
  overrides: { redirectUri?: string; scopes?: string[] } = {},
) {
  const userId = await createUser(t, "owner@example.com")
  const client = await register(t)
  const challenge = await deriveCodeChallenge(VERIFIER)
  const { code } = await asUser(t, userId).mutation(api.features.oauth.mutations.approve, {
    clientId: client.clientId,
    redirectUri: overrides.redirectUri ?? REDIRECT,
    codeChallenge: challenge,
    codeChallengeMethod: "S256",
    resource: RESOURCE,
    issuer: ISSUER,
    scopes: overrides.scopes ?? grantedScopes(),
  })
  return { userId, client, code, challenge }
}

function redeem(t: TestClient, args: Partial<Parameters<typeof buildRedeem>[0]> & { code: string }) {
  return t.mutation(api.service.oauth.redeemCode, buildRedeem(args))
}

/**
 * A rejected grant is RETURNED, not thrown, so that the mutation's `delete`
 * commits — see the note on `redeemCode`. Asserting on the return value is how
 * these tests stay honest about which mechanism is actually in use.
 */
async function expectRefused(call: ReturnType<typeof redeem>): Promise<void> {
  expect(await call).toEqual({ ok: false })
}

function buildRedeem(args: {
  code: string
  codeVerifier?: string
  clientId?: string
  redirectUri?: string
  resource?: string
  issuer?: string
}) {
  return {
    serviceToken: SERVICE_TOKEN,
    code: args.code,
    codeVerifier: args.codeVerifier ?? VERIFIER,
    clientId: args.clientId ?? "",
    redirectUri: args.redirectUri ?? REDIRECT,
    resource: args.resource ?? RESOURCE,
    issuer: args.issuer ?? ISSUER,
  }
}

describe("registerClient", () => {
  test("mints a client id and stores the redirect allowlist", async () => {
    const t = setupConvex()
    const client = await register(t)
    expect(client.clientId).toMatch(/^cgc_[0-9a-f]{32}$/)
    expect(client.redirectUris).toEqual([REDIRECT])
    expect(client.applicationType).toBe("web")
    expect(client.issuer).toBe(ISSUER)
  })

  test("stores and returns native application metadata", async () => {
    const t = setupConvex()
    const client = await t.mutation(api.service.oauth.registerClient, {
      serviceToken: SERVICE_TOKEN,
      clientName: "ChatGPT desktop",
      redirectUris: ["http://127.0.0.1:41234/callback"],
      applicationType: "native",
      issuer: ISSUER,
    })
    expect(client.applicationType).toBe("native")
    expect(client.issuer).toBe(ISSUER)
    const row = await t.run(async (ctx) => ctx.db.query("oauthClients").first())
    expect(row?.applicationType).toBe("native")
    expect(row?.issuer).toBe(ISSUER)
  })

  test("accepts a legacy registration and binds its issuer on first consent", async () => {
    const t = setupConvex()
    const client = await t.mutation(api.service.oauth.registerClient, {
      serviceToken: SERVICE_TOKEN,
      clientName: "Legacy host",
      redirectUris: [REDIRECT],
    })
    expect(client.applicationType).toBe("web")
    expect(client.issuer).toBeUndefined()

    const userId = await createUser(t)
    await asUser(t, userId).mutation(api.features.oauth.mutations.approve, {
      clientId: client.clientId,
      redirectUri: REDIRECT,
      codeChallenge: await deriveCodeChallenge(VERIFIER),
      codeChallengeMethod: "S256",
      resource: RESOURCE,
      issuer: ISSUER,
      scopes: grantedScopes(),
    })
    const row = await t.run(async (ctx) =>
      ctx.db
        .query("oauthClients")
        .withIndex("by_clientId", (q) => q.eq("clientId", client.clientId))
        .first(),
    )
    expect(row?.issuer).toBe(ISSUER)
  })

  test("refuses an unsupported application type or malformed issuer", async () => {
    const t = setupConvex()
    await expectRejected(
      t.mutation(api.service.oauth.registerClient, {
        serviceToken: SERVICE_TOKEN,
        clientName: "Bad",
        redirectUris: [REDIRECT],
        applicationType: "desktop",
        issuer: ISSUER,
      }),
      "INVALID_INPUT",
    )
    await expectRejected(
      t.mutation(api.service.oauth.registerClient, {
        serviceToken: SERVICE_TOKEN,
        clientName: "Bad",
        redirectUris: [REDIRECT],
        applicationType: "web",
        issuer: "javascript:alert(1)",
      }),
      "INVALID_INPUT",
    )
  })

  test("refuses a wrong service token", async () => {
    const t = setupConvex()
    await expectRejected(
      t.mutation(api.service.oauth.registerClient, {
        serviceToken: WRONG_SERVICE_TOKEN,
        clientName: "Claude",
        redirectUris: [REDIRECT],
        applicationType: "web",
        issuer: ISSUER,
      }),
      "NOT_AUTHORIZED",
    )
  })

  test.each([
    ["http on a public host", "http://evil.test/cb"],
    ["a fragment", "https://ok.test/cb#x"],
    ["javascript", "javascript:alert(1)"],
    ["a relative path", "/cb"],
    ["a bare scheme with no dot", "myapp://cb"],
  ])("rejects %s as a redirect URI", async (_label, uri) => {
    const t = setupConvex()
    await expectRejected(register(t, [uri]), "INVALID_INPUT")
  })

  test.each([
    ["https", "https://ok.test/cb"],
    ["http on loopback", "http://127.0.0.1:41234/cb"],
    ["a reverse-DNS app scheme", "com.example.app://cb"],
  ])("accepts %s", async (_label, uri) => {
    const t = setupConvex()
    expect((await register(t, [uri])).redirectUris).toEqual([uri])
  })

  test("one bad URI rejects the whole registration", async () => {
    // Silently dropping it would register a client whose real allowlist is
    // shorter than it believes, failing much later at redirect time.
    const t = setupConvex()
    await expectRejected(register(t, [REDIRECT, "http://evil.test/cb"]), "INVALID_INPUT")
  })

  test("requires at least one redirect URI", async () => {
    const t = setupConvex()
    await expectRejected(register(t, []), "INVALID_INPUT")
  })
})

describe("approve — the consent step", () => {
  test("takes the user from the SESSION, not from an argument", async () => {
    const t = setupConvex()
    const { userId, code } = await grantCode(t)
    const row = await t.run(async (ctx) => ctx.db.query("oauthCodes").first())
    expect(row?.userId).toBe(userId)
    expect(row?.codeHash).not.toBe(code)
    expect(row?.resource).toBe(RESOURCE)
    expect(row?.issuer).toBe(ISSUER)
  })

  test("an anonymous caller cannot mint a code", async () => {
    const t = setupConvex()
    const client = await register(t)
    await expectRejected(
      t.mutation(api.features.oauth.mutations.approve, {
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeChallenge: await deriveCodeChallenge(VERIFIER),
        codeChallengeMethod: "S256",
        resource: RESOURCE,
        issuer: ISSUER,
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("refuses a redirect URI the client never registered", async () => {
    // The whole flow's safety rests here: this is what stops a code being
    // delivered to an attacker's host after an honest user approves.
    const t = setupConvex()
    const userId = await createUser(t)
    const client = await register(t)
    await expectRejected(
      asUser(t, userId).mutation(api.features.oauth.mutations.approve, {
        clientId: client.clientId,
        redirectUri: "https://evil.test/cb",
        codeChallenge: await deriveCodeChallenge(VERIFIER),
        codeChallengeMethod: "S256",
        resource: RESOURCE,
        issuer: ISSUER,
      }),
      "INVALID_INPUT",
    )
  })

  test("refuses PKCE plain — no silent downgrade", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const client = await register(t)
    await expectRejected(
      asUser(t, userId).mutation(api.features.oauth.mutations.approve, {
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeChallenge: await deriveCodeChallenge(VERIFIER),
        codeChallengeMethod: "plain",
        resource: RESOURCE,
        issuer: ISSUER,
      }),
      "INVALID_INPUT",
    )
  })

  test("refuses consent when a client_id belongs to another issuer", async () => {
    const t = setupConvex()
    const userId = await createUser(t)
    const client = await register(t)
    await expectRejected(
      asUser(t, userId).mutation(api.features.oauth.mutations.approve, {
        clientId: client.clientId,
        redirectUri: REDIRECT,
        codeChallenge: await deriveCodeChallenge(VERIFIER),
        codeChallengeMethod: "S256",
        resource: RESOURCE,
        issuer: "https://other.example",
        scopes: grantedScopes(),
      }),
      "INVALID_INPUT",
    )
  })

  test("stores only the digest of the code", async () => {
    const t = setupConvex()
    const { code } = await grantCode(t)
    // `.take`, not `.collect` — the repo forbids an unbounded read even in a
    // test, and a bound above the expected count proves the same thing.
    const rows = await t.run(async (ctx) => ctx.db.query("oauthCodes").take(10))
    expect(rows).toHaveLength(1)
    expect(JSON.stringify(rows)).not.toContain(code)
  })
})

describe("redeemCode", () => {
  test("exchanges a valid code for a working bearer token", async () => {
    const t = setupConvex()
    const { userId, client, code } = await grantCode(t)
    const issued = await redeem(t, { code, clientId: client.clientId })

    expect(issued.ok).toBe(true)
    if (!issued.ok) throw new Error("unreachable")
    expect(issued.accessToken).toMatch(/^cgk_key_[0-9a-f]{32}_[0-9a-f]{64}$/)
    expect(issued.expiresIn).toBeGreaterThan(0)

    // The token is an ordinary apiKeys row — which is what lets the gateway
    // authenticate it with no second code path, and the user revoke it with no
    // second screen.
    const key = await t.run(async (ctx) => ctx.db.query("apiKeys").first())
    expect(key?.userId).toBe(userId)
    expect(key?.clientId).toBe(client.clientId)
    expect(key?.status).toBe("active")
    expect(key?.expiresAt).toBeGreaterThan(Date.now())
    expect(key?.audience).toBe(RESOURCE)
    // An older client that omits `scope` receives the canonical full set;
    // explicit read-only consent is covered by the next test.
    expect(key?.scopes).toEqual(grantedScopes())
  })

  test("binds a read-only consent to a read-only token and API-key row", async () => {
    const t = setupConvex()
    const { client, code } = await grantCode(t, { scopes: [SCOPE_READ] })
    const issued = await redeem(t, { code, clientId: client.clientId })
    expect(issued).toMatchObject({ ok: true, scopes: [SCOPE_READ] })
    const key = await t.run(async (ctx) => ctx.db.query("apiKeys").first())
    expect(key?.scopes).toEqual([SCOPE_READ])
  })

  test("the issued token expires, so a grant is never immortal", async () => {
    const t = setupConvex()
    const { client, code } = await grantCode(t)
    await redeem(t, { code, clientId: client.clientId })
    const record = await t.query(api.service.apiKeys.getRecord, {
      serviceToken: SERVICE_TOKEN,
      keyId: (await t.run(async (ctx) => ctx.db.query("apiKeys").first()))?.keyId ?? "",
    })
    // Load-bearing: authenticateCaller can only enforce an expiry it can SEE,
    // so the record crossing to the gateway must carry it.
    expect(record?.expiresAt).toBeGreaterThan(Date.now())
    expect(record?.audience).toBe(RESOURCE)
  })

  test("a code is single-use", async () => {
    const t = setupConvex()
    const { client, code } = await grantCode(t)
    await redeem(t, { code, clientId: client.clientId })
    await expectRefused(redeem(t, { code, clientId: client.clientId }))
  })

  test("a FAILED exchange still burns the code", async () => {
    // The test that caught the real bug. A Convex mutation is one transaction,
    // so an earlier version that deleted the row and then THREW had its delete
    // rolled back — leaving a stolen code live for the next attempt. Returning
    // the refusal instead is what makes the delete stick.
    const t = setupConvex()
    const { client, code } = await grantCode(t)
    await expectRefused(redeem(t, { code, clientId: client.clientId, codeVerifier: "b".repeat(64) }))

    const rows = await t.run(async (ctx) => ctx.db.query("oauthCodes").take(10))
    expect(rows).toHaveLength(0)
    // And the correct verifier no longer helps: the code is gone for good.
    await expectRefused(redeem(t, { code, clientId: client.clientId }))
  })

  test("PKCE actually binds: the right code with no verifier is refused", async () => {
    const t = setupConvex()
    const { client, code } = await grantCode(t)
    await expectRefused(redeem(t, { code, clientId: client.clientId, codeVerifier: "" }))
  })

  test("a malformed verifier is refused WITHOUT consuming the code", async () => {
    const t = setupConvex()
    const { client, code } = await grantCode(t)
    // Too short for RFC 7636 — nothing was presented against the code, so
    // spending it here would let a third party burn an honest client's grant.
    await expectRefused(redeem(t, { code, clientId: client.clientId, codeVerifier: "short" }))
    const rows = await t.run(async (ctx) => ctx.db.query("oauthCodes").take(10))
    expect(rows).toHaveLength(1)
  })

  test("another client cannot redeem a code issued to this one", async () => {
    const t = setupConvex()
    const { code } = await grantCode(t)
    const other = await register(t)
    await expectRefused(redeem(t, { code, clientId: other.clientId }))
  })

  test("the RFC 9207 issuer is re-checked at exchange", async () => {
    const t = setupConvex()
    const { client, code } = await grantCode(t)
    await expectRefused(
      redeem(t, {
        code,
        clientId: client.clientId,
        issuer: "https://other.example",
      }),
    )
  })

  test("the RFC 8707 resource is re-checked at exchange", async () => {
    const t = setupConvex()
    const { client, code } = await grantCode(t)
    await expectRefused(
      redeem(t, {
        code,
        clientId: client.clientId,
        resource: "https://other.example/mcp",
      }),
    )
  })

  test("the redirect URI is re-checked at exchange", async () => {
    const t = setupConvex()
    const { client, code } = await grantCode(t)
    await expectRefused(
      redeem(t, { code, clientId: client.clientId, redirectUri: "https://ok.test/other" }),
    )
  })

  test("an expired code is refused", async () => {
    const t = setupConvex()
    const { client, code } = await grantCode(t)
    await t.run(async (ctx) => {
      const row = await ctx.db.query("oauthCodes").first()
      if (row === null) throw new Error("fixture code missing")
      await ctx.db.patch(row._id, { expiresAt: Date.now() - 1 })
    })
    await expectRefused(redeem(t, { code, clientId: client.clientId }))
  })

  test("no token is minted by any refused exchange", async () => {
    const t = setupConvex()
    const { client, code } = await grantCode(t)
    await expectRefused(redeem(t, { code, clientId: client.clientId, codeVerifier: "b".repeat(64) }))
    const keys = await t.run(async (ctx) => ctx.db.query("apiKeys").take(10))
    expect(keys).toHaveLength(0)
  })

  test("refuses a wrong service token", async () => {
    const t = setupConvex()
    const { client, code } = await grantCode(t)
    await expectRejected(
      t.mutation(api.service.oauth.redeemCode, {
        ...buildRedeem({ code, clientId: client.clientId }),
        serviceToken: WRONG_SERVICE_TOKEN,
      }),
      "NOT_AUTHORIZED",
    )
  })

  test("reconnecting replaces the client's previous token, and only that one", async () => {
    const t = setupConvex()
    const userId = await createUser(t, "owner@example.com")
    const claude = await register(t)
    const other = await register(t, ["https://chatgpt.com/connector_platform_oauth_redirect"])
    const challenge = await deriveCodeChallenge(VERIFIER)

    async function connect(clientId: string, redirectUri: string) {
      const { code } = await asUser(t, userId).mutation(api.features.oauth.mutations.approve, {
        clientId,
        redirectUri,
        codeChallenge: challenge,
        codeChallengeMethod: "S256",
        resource: RESOURCE,
        issuer: ISSUER,
        scopes: grantedScopes(),
      })
      await redeem(t, { code, clientId, redirectUri })
    }

    await connect(claude.clientId, REDIRECT)
    await connect(other.clientId, "https://chatgpt.com/connector_platform_oauth_redirect")
    await connect(claude.clientId, REDIRECT)

    const keys = await t.run(async (ctx) => ctx.db.query("apiKeys").take(10))
    const active = keys.filter((key) => key.status === "active")
    // Claude's first token is revoked by its own reconnect; the other client's
    // is untouched. Revoking Claude must never sign out ChatGPT.
    expect(active).toHaveLength(2)
    expect(active.filter((key) => key.clientId === claude.clientId)).toHaveLength(1)
    expect(active.filter((key) => key.clientId === other.clientId)).toHaveLength(1)
    expect(keys.filter((key) => key.status === "revoked")).toHaveLength(1)
  })
})
