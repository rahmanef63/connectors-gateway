/**
 * The remote-MCP connectors this build ships, as data.
 *
 * `../connectors/*.json` is the SHIPPED manifest — the file the gateway boots from — and
 * `examples/*.connector.json` is the published illustration of the same contract. They are
 * kept byte-identical by ./connectors.test.ts. The shipped copy cannot live in `examples/`:
 * `.dockerignore` excludes that directory from the gateway image, so a container booting
 * from it would crash on import, and a docs directory is edited to illustrate, not to
 * change what production serves.
 *
 * Adding a connector is one JSON file plus one line below. No package, no adapter, no code.
 * This list is the file-backed stand-in for the `connectors` table of docs/16 step 3.
 */
import type { ConnectorManifest } from "@cg/core"
import { validateManifest } from "@cg/schemas"
import careerpack from "../connectors/careerpack.connector.json"

/**
 * Validated HERE, at the JSON boundary, rather than cast: these files are data today and
 * user-written rows tomorrow, so the type has to be earned. Throwing during module load is
 * the point — a malformed manifest must stop the process (docs/13 Phase 0 contract gate).
 * apps/gateway/src/registry.ts re-validates every manifest it is given; that gate stays.
 */
export const REMOTE_MCP_MANIFESTS: readonly ConnectorManifest[] = Object.freeze([
  validateManifest(careerpack),
])
