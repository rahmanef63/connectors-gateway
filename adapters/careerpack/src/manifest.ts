/**
 * CareerPack connector manifest — the normalized, transport-free action surface
 * (docs/06-connector-contract.md). Kept in sync with examples/careerpack.connector.json.
 *
 * MVP scope is deliberately two actions: one safe read, one non-destructive write
 * (adapters/careerpack/README.md). Do not mirror the full upstream tool surface here.
 */
import type { ConnectorManifest } from "@cg/core"
import { defineAction, defineConnector } from "@cg/sdk"

export const CAREERPACK_CONNECTOR_ID = "careerpack"

export const ACTION_PROFILE_READ = "careerpack.profile.read"
export const ACTION_APPLICATION_CREATE = "careerpack.application.create"

/** Shared by the manifest schema and the runtime input guard. */
export const APPLICATION_STATUSES = ["draft", "applied", "interviewing", "offer", "rejected"] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

export const MAX_TEXT_FIELD = 200
export const MAX_NOTES = 2000

const profileRead = defineAction({
  id: ACTION_PROFILE_READ,
  title: "Read CareerPack profile",
  description: "Return profile data permitted for the current user.",
  inputSchema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {},
    additionalProperties: false,
  },
  risk: "R0",
  annotations: { readOnly: true, destructive: false, idempotent: true },
})

// TODO(rr): examples/careerpack.connector.json (edited concurrently) names this action's
// fields `jobTitle` + `source`; this adapter was specified with `role` + `status`. Ids,
// titles, risk and annotations already match — reconcile the property names in one pass
// once the upstream tools/list is confirmed, then update ./input with them.
const applicationCreate = defineAction({
  id: ACTION_APPLICATION_CREATE,
  title: "Create job application",
  description: "Create a job application record for the current user.",
  inputSchema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      role: {
        type: "string",
        minLength: 1,
        maxLength: MAX_TEXT_FIELD,
        description: "Job title applied for.",
      },
      company: {
        type: "string",
        minLength: 1,
        maxLength: MAX_TEXT_FIELD,
        description: "Company the application targets.",
      },
      status: {
        type: "string",
        enum: [...APPLICATION_STATUSES],
        default: "draft",
        description: "Pipeline stage of the application.",
      },
      notes: {
        type: "string",
        maxLength: MAX_NOTES,
        description: "Free-form notes stored with the application.",
      },
    },
    required: ["role", "company"],
    additionalProperties: false,
  },
  risk: "R1",
  annotations: { readOnly: false, destructive: false, idempotent: false },
})

/**
 * `auth.type` is `bearer`: the gateway holds one CareerPack bearer per connection
 * and presents it to the remote MCP server. examples/careerpack.connector.json still
 * documents `oauth2` — that is the intended end state once CareerPack's OAuth flow is
 * wired; the stored credential shape (ConnectionCredential.token) is identical either way.
 */
export const manifest: ConnectorManifest = defineConnector({
  id: CAREERPACK_CONNECTOR_ID,
  name: "CareerPack",
  version: "0.1.0",
  executor: "cloud",
  auth: { type: "bearer" },
  actions: [profileRead, applicationCreate],
})
