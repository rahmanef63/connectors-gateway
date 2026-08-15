import { describe, expect, test } from "vitest"
import {
  canApprove,
  pairingViewState,
  toChallengeView,
  type PairingChallengeView,
} from "./pairing-state"

const NOW = 1_700_000_000_000

function challenge(overrides: Partial<PairingChallengeView> = {}): PairingChallengeView {
  return {
    code: "ABCD2345",
    deviceName: "Studio Workstation",
    platform: "linux",
    status: "pending",
    expiresAt: NOW + 60_000,
    ...overrides,
  }
}

describe("toChallengeView", () => {
  test("accepts a well-formed row", () => {
    expect(toChallengeView(challenge())).toEqual(challenge())
  })

  test("drops fields outside the view shape", () => {
    const view = toChallengeView({ ...challenge(), userId: "usr_1", credentialHash: "nope" })
    expect(view).not.toBeNull()
    expect(Object.keys(view ?? {}).sort()).toEqual([
      "code",
      "deviceName",
      "expiresAt",
      "platform",
      "status",
    ])
  })

  // DENIED cases.
  test("rejects null and non-objects", () => {
    expect(toChallengeView(null)).toBeNull()
    expect(toChallengeView(undefined)).toBeNull()
    expect(toChallengeView("ABCD2345")).toBeNull()
    expect(toChallengeView(42)).toBeNull()
  })

  test("rejects an unknown platform", () => {
    expect(toChallengeView(challenge({ platform: "solaris" as never }))).toBeNull()
  })

  test("rejects an unknown status", () => {
    expect(toChallengeView(challenge({ status: "approvedish" as never }))).toBeNull()
  })

  test("rejects a missing or non-numeric expiry", () => {
    expect(toChallengeView(challenge({ expiresAt: undefined as never }))).toBeNull()
    expect(toChallengeView(challenge({ expiresAt: "soon" as never }))).toBeNull()
    expect(toChallengeView(challenge({ expiresAt: Number.NaN }))).toBeNull()
  })

  test("rejects empty strings", () => {
    expect(toChallengeView(challenge({ code: "" }))).toBeNull()
    expect(toChallengeView(challenge({ deviceName: "" }))).toBeNull()
  })
})

describe("pairingViewState", () => {
  test("missing_code when the query param did not parse", () => {
    expect(pairingViewState({ code: null, challenge: challenge(), now: NOW })).toBe("missing_code")
  })

  test("unknown when the code matched no challenge", () => {
    expect(pairingViewState({ code: "ABCD2345", challenge: null, now: NOW })).toBe("unknown")
  })

  test("ready for a pending, unexpired challenge", () => {
    expect(pairingViewState({ code: "ABCD2345", challenge: challenge(), now: NOW })).toBe("ready")
  })

  test("approved when a user already approved but the agent has not claimed", () => {
    expect(
      pairingViewState({ code: "ABCD2345", challenge: challenge({ status: "approved" }), now: NOW }),
    ).toBe("approved")
  })

  test("claimed beats every other state, including expiry", () => {
    expect(
      pairingViewState({
        code: "ABCD2345",
        challenge: challenge({ status: "claimed", expiresAt: NOW - 1 }),
        now: NOW,
      }),
    ).toBe("claimed")
  })

  test("expired by status", () => {
    expect(
      pairingViewState({ code: "ABCD2345", challenge: challenge({ status: "expired" }), now: NOW }),
    ).toBe("expired")
  })

  test("expired by clock, even while still marked pending or approved", () => {
    expect(
      pairingViewState({ code: "ABCD2345", challenge: challenge({ expiresAt: NOW - 1 }), now: NOW }),
    ).toBe("expired")
    expect(
      pairingViewState({
        code: "ABCD2345",
        challenge: challenge({ status: "approved", expiresAt: NOW }),
        now: NOW,
      }),
    ).toBe("expired")
  })

  test("expiry is inclusive at the boundary", () => {
    expect(
      pairingViewState({ code: "ABCD2345", challenge: challenge({ expiresAt: NOW }), now: NOW }),
    ).toBe("expired")
    expect(
      pairingViewState({ code: "ABCD2345", challenge: challenge({ expiresAt: NOW + 1 }), now: NOW }),
    ).toBe("ready")
  })
})

describe("canApprove", () => {
  test("only ready offers the button", () => {
    expect(canApprove("ready")).toBe(true)
    for (const state of ["missing_code", "unknown", "claimed", "expired", "approved"] as const) {
      expect(canApprove(state)).toBe(false)
    }
  })
})
