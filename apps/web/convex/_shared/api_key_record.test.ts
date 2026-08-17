// @vitest-environment node
import { describe, expect, test } from "vitest"
import type { Doc } from "../_generated/dataModel"
import { toApiKeyRecord } from "./api_key_record"

const BASE = {
  _id: "k1" as Doc<"apiKeys">["_id"],
  _creationTime: 0,
  keyId: "cgk_abc",
  userId: "usr_1",
  scopes: [],
  secretHash: "hash",
  status: "active" as const,
  label: "test",
}

function doc(extra: Partial<Doc<"apiKeys">>): Doc<"apiKeys"> {
  return { ...BASE, ...extra } as Doc<"apiKeys">
}

describe("toApiKeyRecord", () => {
  test("a hand-minted key keeps having no expiry", () => {
    // Those are revoked, not aged out — an absent expiry is correct here.
    expect(toApiKeyRecord(doc({}))).not.toHaveProperty("expiresAt")
  })

  test("an OAuth grant carries its expiry through unchanged", () => {
    const expiresAt = 1_900_000_000_000
    expect(toApiKeyRecord(doc({ clientId: "cli_1", expiresAt }))).toMatchObject({ expiresAt })
  })

  test("an OAuth grant with no expiry is handed over already expired", () => {
    // The row should not exist. Read as immortal it would be a consent given
    // once that authorises a client forever; read as expired it just fails and
    // the client runs the flow again.
    expect(toApiKeyRecord(doc({ clientId: "cli_1" }))).toMatchObject({ expiresAt: 0 })
  })

  test("the fail-closed expiry is in the past for any plausible clock", () => {
    const record = toApiKeyRecord(doc({ clientId: "cli_1" }))
    expect(record.expiresAt).toBeLessThanOrEqual(Date.now())
  })
})
