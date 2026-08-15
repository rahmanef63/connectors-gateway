import { expect, test } from "bun:test"
import { manifest } from "./manifest"

/**
 * `examples/*.connector.json` is published as the machine-readable illustration of
 * the connector contract, so it has to be the manifest this adapter actually ships
 * — not a hand-maintained copy that drifts (AGENTS.md invariants 9 and 10).
 * Regenerate with: JSON.stringify(manifest, null, 2)
 */
test("the published example is the shipped manifest", async () => {
  const url = new URL("../../../examples/blender.connector.json", import.meta.url)
  const published: unknown = await Bun.file(url).json()

  expect(published).toEqual(JSON.parse(JSON.stringify(manifest)))
})
