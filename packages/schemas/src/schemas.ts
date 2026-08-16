/**
 * The frozen wire contract, as a raw JSON Schema document.
 *
 * Exported so other packages validate against the *same object identity* the
 * validator cache is keyed on — importing the .json file again elsewhere would
 * compile a second copy.
 */
import type { JsonSchema } from "@cg/core"
import connectorManifest from "../connector-manifest.schema.json"

export const connectorManifestSchema: JsonSchema = connectorManifest
