/**
 * A deleting job is judged by what it REFUSES to delete. Most of these pin that.
 */
import { describe, expect, test } from "vitest"
import { internal } from "../_generated/api"
import { OAUTH_CLIENT_IDLE_MS, OAUTH_SWEEP_BATCH } from "../_shared/limits"
import { setupConvex, type TestClient } from "../test.helpers"

const HOUR = 60 * 60 * 1000

async function seedCode(t: TestClient, expiresAt: number, codeHash = `h${expiresAt}`) {
  await t.run(async (ctx) => {
    await ctx.db.insert("oauthCodes", {
      codeHash,
      clientId: "cgc_x",
      userId: "user_x",
      redirectUri: "https://ok.test/cb",
      codeChallenge: "c".repeat(43),
      expiresAt,
    })
  })
}

async function seedClient(
  t: TestClient,
  createdAt: number,
  lastUsedAt?: number,
  clientId = `cgc_${createdAt}${lastUsedAt ?? ""}`,
) {
  await t.run(async (ctx) => {
    await ctx.db.insert("oauthClients", {
      clientId,
      clientName: "probe",
      redirectUris: ["https://ok.test/cb"],
      createdAt,
      ...(lastUsedAt === undefined ? {} : { lastUsedAt }),
    })
  })
}

const sweep = (t: TestClient) => t.mutation(internal.maintenance.oauth_sweep.sweep, {})
const codes = (t: TestClient) => t.run(async (ctx) => ctx.db.query("oauthCodes").take(500))
const clients = (t: TestClient) => t.run(async (ctx) => ctx.db.query("oauthClients").take(500))

describe("oauth sweep — codes", () => {
  test("deletes a lapsed code", async () => {
    const t = setupConvex()
    await seedCode(t, Date.now() - 1)
    expect(await sweep(t)).toMatchObject({ codes: 1 })
    expect(await codes(t)).toHaveLength(0)
  })

  test("leaves a code that is still live", async () => {
    // Deleting an in-flight code would break a user mid-consent, and they would
    // see only "invalid grant" with nothing to retry.
    const t = setupConvex()
    await seedCode(t, Date.now() + HOUR)
    expect(await sweep(t)).toMatchObject({ codes: 0 })
    expect(await codes(t)).toHaveLength(1)
  })

  test("is bounded, and the remainder survives to the next pass", async () => {
    const t = setupConvex()
    const past = Date.now() - HOUR
    for (let i = 0; i < OAUTH_SWEEP_BATCH + 5; i += 1) await seedCode(t, past, `hash-${i}`)

    expect((await sweep(t)).codes).toBe(OAUTH_SWEEP_BATCH)
    expect(await codes(t)).toHaveLength(5)
    // Nothing is lost by the bound — the next tick finishes the job.
    expect((await sweep(t)).codes).toBe(5)
    expect(await codes(t)).toHaveLength(0)
  })
})

describe("oauth sweep — clients", () => {
  test("deletes a client that registered long ago and never exchanged", async () => {
    const t = setupConvex()
    await seedClient(t, Date.now() - OAUTH_CLIENT_IDLE_MS - HOUR)
    expect(await sweep(t)).toMatchObject({ clients: 1 })
    expect(await clients(t)).toHaveLength(0)
  })

  test("NEVER deletes a client that has completed an exchange, however old", async () => {
    // The one that matters. `lastUsedAt` means somebody uses it; deleting it
    // breaks their next reconnect with "unknown client" — undiagnosable from
    // their side, and not their fault.
    const t = setupConvex()
    const ancient = Date.now() - OAUTH_CLIENT_IDLE_MS * 12
    await seedClient(t, ancient, ancient)
    expect(await sweep(t)).toMatchObject({ clients: 0 })
    expect(await clients(t)).toHaveLength(1)
  })

  test("leaves a freshly registered client alone", async () => {
    // A human who registers now and consents in ten minutes must still find it.
    const t = setupConvex()
    await seedClient(t, Date.now())
    expect(await sweep(t)).toMatchObject({ clients: 0 })
    expect(await clients(t)).toHaveLength(1)
  })

  test("sweeps only the unused ones out of a mixed table", async () => {
    const t = setupConvex()
    const old = Date.now() - OAUTH_CLIENT_IDLE_MS - HOUR
    await seedClient(t, old, undefined, "cgc_junk_a")
    await seedClient(t, old, undefined, "cgc_junk_b")
    await seedClient(t, old, old, "cgc_real")
    await seedClient(t, Date.now(), undefined, "cgc_new")

    expect(await sweep(t)).toMatchObject({ clients: 2 })
    const left = (await clients(t)).map((c) => c.clientId).sort()
    expect(left).toEqual(["cgc_new", "cgc_real"])
  })
})

describe("oauth sweep — safety", () => {
  test("is a no-op on an empty deployment", async () => {
    const t = setupConvex()
    expect(await sweep(t)).toEqual({ codes: 0, clients: 0 })
  })

  test("touches nothing but its two tables", async () => {
    // It runs unattended on a schedule; the blast radius has to be pinned.
    const t = setupConvex()
    await t.run(async (ctx) => {
      await ctx.db.insert("apiKeys", {
        keyId: "key_1",
        userId: "user_x",
        scopes: [],
        secretHash: "pbkdf2$sha256$210000$c2FsdA$aGFzaA",
        status: "active",
        label: "untouched",
      })
    })
    await seedCode(t, Date.now() - 1)
    await sweep(t)
    const keys = await t.run(async (ctx) => ctx.db.query("apiKeys").take(10))
    expect(keys).toHaveLength(1)
  })
})
