// @vitest-environment node
import { describe, expect, it } from "vitest"

import {
  CONNECTION_STATUS_TONES,
  DEVICE_STATUS_TONES,
  POLICY_DECISION_TONES,
  TONES,
  TONE_CLASSES,
  toneFrom,
  type Tone,
} from "@/components/status-badge"

/**
 * The tone map is the app's single source of colour for "how did this go".
 * These tests pin the two properties that make it an SSOT rather than a
 * suggestion: every tone resolves, and no two tones resolve to the same thing.
 *
 * Exhaustiveness itself is a COMPILE-time guarantee, not one of these cases:
 * `TONE_CLASSES` is annotated `Readonly<Record<Tone, ToneClasses>>` and `Tone`
 * is derived from `TONES`, so adding a tone to the union without adding its
 * classes fails to typecheck. A missing tone can never fall through to a
 * default at runtime. The runtime check below only guards the reverse drift —
 * a key in the map that is not in the union.
 */

const CLASS_FIELDS = ["text", "border", "pill"] as const

describe("tone map", () => {
  it("covers every tone in the union, and nothing else", () => {
    expect(Object.keys(TONE_CLASSES).sort()).toEqual([...TONES].sort())
  })

  it.each(TONES)("resolves %s to a full class set", (name) => {
    const classes = TONE_CLASSES[name]
    for (const field of CLASS_FIELDS) {
      expect(classes[field].length).toBeGreaterThan(0)
    }
    // The pill is the badge treatment: tint + border + text, all three.
    expect(classes.pill).toContain(classes.border)
    expect(classes.pill).toContain(classes.text)
  })

  it.each(CLASS_FIELDS)("gives every tone a distinct %s", (field) => {
    const values = TONES.map((name) => TONE_CLASSES[name][field])
    expect(new Set(values).size).toBe(TONES.length)
  })

  it("names only design tokens — never a raw colour", () => {
    for (const name of TONES) {
      for (const field of CLASS_FIELDS) {
        expect(TONE_CLASSES[name][field]).not.toMatch(/#|rgb|hsl/)
      }
    }
  })

  it("keeps the pinned semantics of each tone", () => {
    expect(TONE_CLASSES.success.text).toBe("text-success")
    expect(TONE_CLASSES.success.pill).toContain("bg-success/12")
    expect(TONE_CLASSES.danger.text).toContain("destructive")
    expect(TONE_CLASSES.warning.text).toContain("accent")
    expect(TONE_CLASSES.neutral.text).toContain("muted-foreground")
  })
})

describe("toneFrom", () => {
  const map: Readonly<Record<"known", Tone>> = { known: "success" }

  it("resolves a known key", () => {
    expect(toneFrom(map, "known")).toBe("success")
  })

  it("returns undefined for an unknown key", () => {
    expect(toneFrom(map, "nope")).toBeUndefined()
  })

  // The reason this is `Object.hasOwn` and not a bare index: every object
  // inherits these, so `map[key]` would tone a garbage status as if it were
  // real (and `map["constructor"]` would hand a function to the renderer).
  it.each(["toString", "constructor", "valueOf", "__proto__"])(
    "does not resolve the inherited key %s",
    (key) => {
      expect(toneFrom(map, key)).toBeUndefined()
    },
  )
})

describe("domain vocabularies", () => {
  it("tones connection status", () => {
    expect(CONNECTION_STATUS_TONES).toEqual({
      active: "success",
      expired: "warning",
      revoked: "danger",
      error: "danger",
    })
  })

  it("tones device status", () => {
    expect(DEVICE_STATUS_TONES).toEqual({
      online: "success",
      offline: "neutral",
      revoked: "danger",
    })
  })

  it("tones policy decisions, so an approval never reads as an allow", () => {
    expect(POLICY_DECISION_TONES).toEqual({
      ALLOW: "success",
      REQUIRE_APPROVAL: "warning",
      DENY: "danger",
    })
  })

  it.each([
    ["connection", CONNECTION_STATUS_TONES],
    ["device", DEVICE_STATUS_TONES],
    ["policy decision", POLICY_DECISION_TONES],
  ] as const)("resolves every %s tone through the tone map", (_label, map) => {
    for (const name of Object.values(map)) {
      expect(TONES).toContain(name)
    }
  })
})
