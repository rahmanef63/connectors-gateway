// @vitest-environment node
import { describe, expect, test } from "vitest"
import { DEFAULT_DEVICES_LABELS } from "../config/labels"
import {
  PAIRING_GRANT_ORDER,
  isApprovable,
  pairingGrants,
  pairingNotice,
  resolvePairingState,
  toPairingChallengeView,
} from "../lib/pairing"
import type { PairingChallengeView } from "../types"

const NOW = 1_700_000_000_000

const VALID = {
  id: "pch_1",
  code: "ABC123",
  deviceName: "Studio",
  platform: "macos",
  status: "pending",
  expiresAt: NOW + 60_000,
  userId: "usr_1",
}

function challenge(overrides: Partial<PairingChallengeView> = {}): PairingChallengeView {
  return {
    code: "ABC123",
    deviceName: "Studio",
    platform: "macos",
    status: "pending",
    expiresAt: NOW + 60_000,
    ...overrides,
  }
}

describe("toPairingChallengeView", () => {
  test("keeps only the fields the approving user needs", () => {
    const view = toPairingChallengeView(VALID)
    expect(view).toEqual({
      code: "ABC123",
      deviceName: "Studio",
      platform: "macos",
      status: "pending",
      expiresAt: NOW + 60_000,
    })
    expect(Object.hasOwn(view ?? {}, "userId")).toBe(false)
    expect(Object.hasOwn(view ?? {}, "id")).toBe(false)
  })

  test.each<[string, unknown]>([
    ["null", null],
    ["a string", "ABC123"],
    ["a missing code", { ...VALID, code: "" }],
    ["a missing device name", { ...VALID, deviceName: undefined }],
    ["an unknown platform", { ...VALID, platform: "freebsd" }],
    ["an unknown status", { ...VALID, status: "revoked" }],
    ["a non-numeric expiry", { ...VALID, expiresAt: "soon" }],
  ])("DENIED: rejects %s", (_name, input) => {
    expect(toPairingChallengeView(input)).toBeNull()
  })
})

describe("resolvePairingState", () => {
  test("undefined is still loading, null is a code we do not know", () => {
    expect(resolvePairingState(undefined, NOW)).toBe("loading")
    expect(resolvePairingState(null, NOW)).toBe("missing")
  })

  test("a live pending code is the only approvable state", () => {
    expect(resolvePairingState(challenge(), NOW)).toBe("pending")
    expect(isApprovable("pending")).toBe(true)
    for (const state of ["loading", "missing", "expired", "approved", "claimed"] as const) {
      expect(isApprovable(state)).toBe(false)
    }
  })

  test("expiry is inclusive at the deadline", () => {
    expect(resolvePairingState(challenge({ expiresAt: NOW + 1 }), NOW)).toBe("pending")
    expect(resolvePairingState(challenge({ expiresAt: NOW }), NOW)).toBe("expired")
    expect(resolvePairingState(challenge({ expiresAt: NOW - 1 }), NOW)).toBe("expired")
  })

  test("a claimed code stays claimed even after it expires", () => {
    expect(resolvePairingState(challenge({ status: "claimed", expiresAt: NOW - 1 }), NOW)).toBe("claimed")
  })

  test("an approved but expired code cannot be approved again", () => {
    expect(resolvePairingState(challenge({ status: "approved", expiresAt: NOW - 1 }), NOW)).toBe("expired")
    expect(resolvePairingState(challenge({ status: "approved" }), NOW)).toBe("approved")
  })

  test("a server-marked expired status wins over a future deadline", () => {
    expect(resolvePairingState(challenge({ status: "expired", expiresAt: NOW + 10_000 }), NOW)).toBe("expired")
  })
})

describe("pairingGrants", () => {
  test("returns every grant in reading order", () => {
    const grants = pairingGrants(DEFAULT_DEVICES_LABELS)
    const source = DEFAULT_DEVICES_LABELS.pairing.grants
    expect(grants).toEqual([
      source.localActions,
      source.credential,
      source.perCallChecks,
      source.revocable,
    ])
  })

  test("the order covers exactly the grants the copy declares", () => {
    expect([...PAIRING_GRANT_ORDER].sort()).toEqual(
      Object.keys(DEFAULT_DEVICES_LABELS.pairing.grants).sort(),
    )
  })

  test("the two consequences of approving are always stated", () => {
    const shown = pairingGrants(DEFAULT_DEVICES_LABELS).join(" ")
    // It runs local actions on that machine…
    expect(shown).toMatch(/local actions/i)
    // …and no credential ever reaches an AI client.
    expect(shown).toMatch(/credential/i)
    expect(shown).toMatch(/never handed to ChatGPT, Claude or any other AI client/i)
    expect(DEFAULT_DEVICES_LABELS.pairing.credentialNotice).toMatch(/AI client/i)
  })

  test("copy comes from the labels object, not from the module", () => {
    const grants = pairingGrants({
      ...DEFAULT_DEVICES_LABELS,
      pairing: {
        ...DEFAULT_DEVICES_LABELS.pairing,
        grants: { ...DEFAULT_DEVICES_LABELS.pairing.grants, credential: "Kredensial tidak pernah tampil di sini." },
      },
    })
    expect(grants[1]).toBe("Kredensial tidak pernah tampil di sini.")
  })

  test("DENIED: a blank or non-string override is skipped, never rendered as an empty bullet", () => {
    const grants = pairingGrants({
      ...DEFAULT_DEVICES_LABELS,
      pairing: {
        ...DEFAULT_DEVICES_LABELS.pairing,
        grants: {
          ...DEFAULT_DEVICES_LABELS.pairing.grants,
          localActions: "",
          revocable: 7 as unknown as string,
        },
      },
    })
    expect(grants).toEqual([
      DEFAULT_DEVICES_LABELS.pairing.grants.credential,
      DEFAULT_DEVICES_LABELS.pairing.grants.perCallChecks,
    ])
  })
})

describe("pairingNotice", () => {
  test("every non-actionable state has copy", () => {
    for (const state of ["loading", "missing", "expired", "approved", "claimed"] as const) {
      const notice = pairingNotice(state, DEFAULT_DEVICES_LABELS)
      expect(notice.title.length).toBeGreaterThan(0)
      expect(typeof notice.description).toBe("string")
    }
  })

  test("copy comes from the labels object, not from the module", () => {
    const notice = pairingNotice("missing", {
      ...DEFAULT_DEVICES_LABELS,
      pairing: { ...DEFAULT_DEVICES_LABELS.pairing, missingTitle: "Kode tidak ditemukan" },
    })
    expect(notice.title).toBe("Kode tidak ditemukan")
  })
})
