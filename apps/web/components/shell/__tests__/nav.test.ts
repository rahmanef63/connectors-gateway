// @vitest-environment node
//
// The nav registry is the shell's SSOT: the sidebar, the dock, the sheet, the
// breadcrumb and every page header read it. These prove the invariants the rest
// of the shell assumes — a broken one shows up as a screen you cannot reach, or
// a header that names the wrong thing, and neither fails the typechecker.
import { describe, expect, it } from "vitest"

import { Icon } from "../icons"
import {
  DOCK_TABS,
  FAB,
  NAV_GROUPS,
  NAV_ITEMS,
  NAV_ROUTE_PATTERNS,
  navItemFor,
  navTitleFor,
} from "../nav-items"

describe("navItemFor", () => {
  it("resolves an exact route", () => {
    expect(navItemFor("/devices")?.slug).toBe("devices")
    expect(navItemFor("/setup")?.slug).toBe("setup")
  })

  it("resolves a nested route to its section (longest prefix wins)", () => {
    expect(navItemFor("/devices/abc")?.slug).toBe("devices")
    expect(navItemFor("/devices/abc/actions")?.slug).toBe("devices")
  })

  it("picks the longest matching href when one item nests under another", () => {
    // Guards the *rule*, not today's data: if a screen is ever added at a path
    // below an existing one, the deeper item must win. Simulated over the same
    // matcher the registry uses.
    const longest = [...NAV_ITEMS]
      .filter((item) => "/devices/abc".startsWith(item.href))
      .sort((a, b) => b.href.length - a.href.length)[0]
    expect(navItemFor("/devices/abc")).toBe(longest)
  })

  it("matches on a path segment, not a string prefix", () => {
    // /devices-archive must not resolve to Devices.
    expect(navItemFor("/devices-archive")).toBeUndefined()
  })

  it("has no item for the dashboard root (it redirects)", () => {
    expect(navItemFor("/")).toBeUndefined()
  })
})

describe("navTitleFor", () => {
  it("gives a registry screen the same name its header shows", () => {
    for (const item of NAV_ITEMS) expect(navTitleFor(item.href)).toBe(item.label)
  })

  it("names nothing for a route outside the registry, so the layout default wins", () => {
    expect(navTitleFor("/")).toBeUndefined()
    expect(navTitleFor("/pair")).toBeUndefined()
  })
})

describe("NAV_ROUTE_PATTERNS (the auth gate reads these)", () => {
  it("covers every screen, so none can ship ungated", () => {
    expect(NAV_ROUTE_PATTERNS).toHaveLength(NAV_ITEMS.length)
    for (const item of NAV_ITEMS) expect(NAV_ROUTE_PATTERNS).toContain(`${item.href}(.*)`)
  })
})

describe("registry invariants", () => {
  it("gives every item a unique href", () => {
    const hrefs = NAV_ITEMS.map((item) => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("gives every item a unique slug", () => {
    const slugs = NAV_ITEMS.map((item) => item.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("lists every item in exactly one group", () => {
    const grouped = NAV_GROUPS.flatMap((group) => group.items)
    expect(grouped).toHaveLength(NAV_ITEMS.length)
    expect(new Set(grouped.map((item) => item.slug)).size).toBe(NAV_ITEMS.length)
  })

  it("keeps DOCK_TABS a subset of NAV_ITEMS", () => {
    expect(DOCK_TABS.length).toBeGreaterThan(0)
    for (const tab of DOCK_TABS) expect(NAV_ITEMS).toContain(tab)
  })

  it("keeps the dock to three tabs, so the FAB stays the centre of five slots", () => {
    expect(DOCK_TABS.length).toBeLessThanOrEqual(3)
    expect(DOCK_TABS).not.toContain(FAB)
  })

  it("keeps the FAB in NAV_ITEMS, so the sheet and the sidebar can reach it", () => {
    expect(NAV_ITEMS).toContain(FAB)
  })

  it("names an icon that exists in the icon set", () => {
    // `IconName` already enforces this at compile time; this catches a glyph
    // being renamed or dropped from SHAPES, which typechecks fine in isolation.
    // Icon() builds its children eagerly, so a missing name throws right here —
    // no renderer needed.
    for (const item of NAV_ITEMS) {
      expect(() => Icon({ name: item.icon })).not.toThrow()
    }
  })
})
