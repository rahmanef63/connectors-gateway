import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "vitest"

const source = readFileSync(fileURLToPath(new URL("../more-sheet.tsx", import.meta.url)), "utf8")

describe("mobile all-screens sheet layout", () => {
  test("uses an explicit dynamic viewport height instead of intrinsic dialog height", () => {
    expect(source).toContain("h-[calc(100dvh-max(env(safe-area-inset-top),0.5rem))]")
    expect(source).toContain("max-h-none")
    expect(source).not.toContain("max-h-[min(86dvh,44rem)]")
  })

  test("keeps the existing mobile-only dialog flow and safe-area footer", () => {
    expect(source).toContain("max-md:open:flex md:hidden")
    expect(source).toContain("env(safe-area-inset-bottom)")
    expect(source).toContain("dialog.showModal()")
  })
})
