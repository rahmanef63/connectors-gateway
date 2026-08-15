/**
 * Runtime input guards for the two CareerPack actions.
 *
 * ponytail: hand-written guards mirroring the manifest JSON Schemas, because
 * packages/schemas is still empty. Upgrade path is one shared validator at the gateway
 * edge driven by `action.inputSchema` — then this file collapses to a type assertion.
 */
import { GatewayError } from "@cg/core"
import {
  ACTION_APPLICATION_CREATE,
  ACTION_PROFILE_READ,
  APPLICATION_STATUSES,
  MAX_NOTES,
  MAX_TEXT_FIELD,
} from "./manifest"

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** Validate AI-supplied input and shape it into upstream tool arguments. */
export function toolArguments(actionId: string, input: unknown): Record<string, unknown> {
  switch (actionId) {
    case ACTION_PROFILE_READ:
      return profileReadArgs(input)
    case ACTION_APPLICATION_CREATE:
      return applicationCreateArgs(input)
    default:
      throw new GatewayError("ACTION_NOT_FOUND", "This CareerPack action does not exist.")
  }
}

function asObject(input: unknown): Record<string, unknown> {
  if (input === undefined || input === null) return {}
  if (!isRecord(input)) throw new GatewayError("INVALID_INPUT", "Input must be an object.")
  return input
}

function rejectUnknownKeys(input: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(input)) {
    if (!allowed.includes(key)) {
      throw new GatewayError("INVALID_INPUT", "Input contains an unsupported property.")
    }
  }
}

function profileReadArgs(input: unknown): Record<string, unknown> {
  rejectUnknownKeys(asObject(input), [])
  return {}
}

const APPLICATION_KEYS = ["role", "company", "status", "notes"] as const

function applicationCreateArgs(input: unknown): Record<string, unknown> {
  const raw = asObject(input)
  rejectUnknownKeys(raw, APPLICATION_KEYS)

  const args: Record<string, unknown> = {
    role: requiredText(raw["role"], "role", MAX_TEXT_FIELD),
    company: requiredText(raw["company"], "company", MAX_TEXT_FIELD),
  }

  const status = raw["status"]
  if (status !== undefined) {
    if (typeof status !== "string" || !(APPLICATION_STATUSES as readonly string[]).includes(status)) {
      throw new GatewayError("INVALID_INPUT", "`status` must be one of: " + APPLICATION_STATUSES.join(", ") + ".")
    }
    args["status"] = status
  }

  const notes = raw["notes"]
  if (notes !== undefined) {
    if (typeof notes !== "string" || notes.length > MAX_NOTES) {
      throw new GatewayError("INVALID_INPUT", `\`notes\` must be a string of at most ${MAX_NOTES} characters.`)
    }
    args["notes"] = notes
  }

  return args
}

function requiredText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string") {
    throw new GatewayError("INVALID_INPUT", `\`${field}\` is required and must be a string.`)
  }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > max) {
    throw new GatewayError("INVALID_INPUT", `\`${field}\` must be 1-${max} characters.`)
  }
  return trimmed
}
