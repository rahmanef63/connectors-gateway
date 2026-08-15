/**
 * CareerPack connector manifest — the normalized, transport-free action surface
 * (docs/06-connector-contract.md). Kept in sync with examples/careerpack.connector.json.
 *
 * MVP scope is deliberately two actions: one safe read, one non-destructive write
 * (adapters/careerpack/README.md). Do not mirror the full upstream tool surface here.
 *
 * Every schema below mirrors the tool CareerPack actually publishes, verified against
 * its source on 2026-08-15:
 *   profile_get         convex/mcp/tools/profile.ts
 *   applications_create convex/mcp/tools/applications.ts
 * Property names, requiredness, the status enum and the descriptions are upstream's,
 * because the descriptions are what an AI client reads to decide how to call this.
 * Renaming a field here does not rename it upstream — it only produces a call the
 * server rejects.
 */
import type { ConnectorManifest } from "@cg/core"
import { defineAction, defineConnector } from "@cg/sdk"

export const CAREERPACK_CONNECTOR_ID = "careerpack"

export const ACTION_PROFILE_READ = "careerpack.profile.read"
export const ACTION_APPLICATION_CREATE = "careerpack.application.create"

/** Upstream's STATUS_VALUES verbatim (convex/mcp/tools/applications.ts), which itself
 *  mirrors APPLICATION_STATUS_WHITELIST in convex/applications/mutations.ts. Any value
 *  outside this list is rejected by the server with "Status tidak valid". */
export const APPLICATION_STATUSES = [
  "applied",
  "screening",
  "interview",
  "offer",
  "rejected",
  "withdrawn",
  "accepted",
] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]

/**
 * Upstream's published schema carries no length limits, but its mutation does:
 * `applicationFields` in convex/applications/mutations.ts caps the short fields at 120,
 * salary at 60 and notes at 600. Declaring them makes the gateway reject oversized text
 * at its own trust boundary instead of forwarding it, and tells the model the bound
 * before it spends a call learning it from a rejection.
 */
const MAX_SHORT_TEXT = 120
const MAX_SALARY = 60
const MAX_NOTES = 600
/** Convex document ids are short opaque strings; bounded so a blob cannot be forwarded. */
const MAX_ID = 64

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

const applicationCreate = defineAction({
  id: ACTION_APPLICATION_CREATE,
  title: "Create job application",
  // Upstream's description, minus its pointer to `cv_list` — the gateway does not
  // publish that tool, so telling a model to call it would be a dead end.
  description:
    "Record a new job application. company, position, location and source are all required — source is where the job was found ('LinkedIn', 'JobStreet', 'referral', 'company website'); ask the user rather than guessing it. status defaults to 'applied'; set it only when the user says they are already further along ('I have an interview next week' -> 'interview'). The applied date is set to now, so do not use this to backfill an application from months ago without telling the user the date will be today.",
  inputSchema: {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    properties: {
      company: {
        type: "string",
        minLength: 1,
        maxLength: MAX_SHORT_TEXT,
        description: "Hiring company name.",
      },
      position: {
        type: "string",
        minLength: 1,
        maxLength: MAX_SHORT_TEXT,
        description: "Role applied for.",
      },
      location: {
        type: "string",
        minLength: 1,
        maxLength: MAX_SHORT_TEXT,
        description: "Job location, e.g. 'Jakarta' or 'Remote'.",
      },
      source: {
        type: "string",
        minLength: 1,
        maxLength: MAX_SHORT_TEXT,
        description: "Where the job was found, e.g. 'LinkedIn', 'referral'.",
      },
      salary: {
        type: "string",
        maxLength: MAX_SALARY,
        description: "Free-text salary or range as the user says it, e.g. '10-15 juta'.",
      },
      notes: {
        type: "string",
        maxLength: MAX_NOTES,
        description: "Anything worth remembering.",
      },
      status: {
        type: "string",
        enum: [...APPLICATION_STATUSES],
        description: "Defaults to 'applied'.",
      },
      cv_id: {
        type: "string",
        minLength: 1,
        maxLength: MAX_ID,
        description: "CareerPack CV id — the CV sent with this application.",
      },
    },
    required: ["company", "position", "location", "source"],
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
