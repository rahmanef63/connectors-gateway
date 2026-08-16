import { describe, expect, test } from "bun:test"
import { approvalHash, inputPreview } from "./approval-key"

describe("approvalHash — what an approval is for", () => {
  test("differs when the ARGUMENTS differ, which is the whole point", () => {
    // Approving "delete issue 5" must not authorise "delete issue 500". An
    // approval keyed on the action alone would be a standing grant.
    const a = approvalHash("gh", "gh.issue.delete", { id: 5 })
    const b = approvalHash("gh", "gh.issue.delete", { id: 500 })
    expect(a).not.toBe(b)
  })

  test("differs across connectors and actions", () => {
    expect(approvalHash("a", "x", {})).not.toBe(approvalHash("b", "x", {}))
    expect(approvalHash("a", "x", {})).not.toBe(approvalHash("a", "y", {}))
  })

  test("is stable across key order, so one call needs one approval", () => {
    expect(approvalHash("c", "a", { b: 1, a: 2 })).toBe(approvalHash("c", "a", { a: 2, b: 1 }))
    expect(approvalHash("c", "a", { n: { y: 1, x: 2 } })).toBe(
      approvalHash("c", "a", { n: { x: 2, y: 1 } }),
    )
  })

  test("does not confuse an absent argument with an empty one", () => {
    expect(approvalHash("c", "a", {})).not.toBe(approvalHash("c", "a", { id: "" }))
  })

  test("preserves array order — [1,2] is not the call [2,1] is", () => {
    expect(approvalHash("c", "a", { ids: [1, 2] })).not.toBe(approvalHash("c", "a", { ids: [2, 1] }))
  })
})

describe("inputPreview", () => {
  test("truncates, because this text is model-written and shown to a human", () => {
    const preview = inputPreview({ note: "x".repeat(5000) })
    expect(preview.length).toBeLessThanOrEqual(300)
    expect(preview.endsWith("…")).toBe(true)
  })

  test("survives input that cannot be serialised", () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(() => inputPreview(cyclic)).not.toThrow()
  })
})
