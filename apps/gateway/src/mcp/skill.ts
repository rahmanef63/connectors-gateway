/** Static skill export used by OpenAI Scan Tools and bundled plugin clients. */
import { GatewayError } from "@cg/core"

export const GATEWAY_SKILL_URI =
  "skill://connectors-gateway/connectors-gateway/SKILL.md" as const

const SKILL_FILE = new URL(
  "../../../../plugin/skills/connectors-gateway/SKILL.md",
  import.meta.url,
)

export type McpSkillEntry = {
  uri: typeof GATEWAY_SKILL_URI
  frontmatter: Record<string, string>
  resources: Array<{ uri: typeof GATEWAY_SKILL_URI; digest: string }>
}

export type GatewaySkill = {
  entry: McpSkillEntry
  text: string
}

let cachedSkill: Promise<GatewaySkill> | null = null

function parseFrontmatter(text: string): Record<string, string> {
  const normalized = text.replace(/\r\n/g, "\n")
  if (!normalized.startsWith("---\n")) {
    throw new GatewayError("INTERNAL", "The bundled skill is missing front matter.")
  }
  const end = normalized.indexOf("\n---\n", 4)
  if (end === -1) {
    throw new GatewayError("INTERNAL", "The bundled skill front matter is not closed.")
  }

  const result: Record<string, string> = Object.create(null)
  for (const rawLine of normalized.slice(4, end).split("\n")) {
    const line = rawLine.trim()
    if (line.length === 0 || line.startsWith("#")) continue
    const colon = line.indexOf(":")
    if (colon <= 0) {
      throw new GatewayError("INTERNAL", "The bundled skill front matter is malformed.")
    }
    const key = line.slice(0, colon).trim()
    let value = line.slice(colon + 1).trim()
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1)
    }
    if (key.length === 0 || value.length === 0 || Object.hasOwn(result, key)) {
      throw new GatewayError("INTERNAL", "The bundled skill front matter is malformed.")
    }
    result[key] = value
  }

  if (result.name !== "connectors-gateway" || typeof result.description !== "string") {
    throw new GatewayError("INTERNAL", "The bundled skill identity is invalid.")
  }
  return result
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function loadGatewaySkill(): Promise<GatewaySkill> {
  cachedSkill ??= (async () => {
    const text = await Bun.file(SKILL_FILE).text()
    const frontmatter = parseFrontmatter(text)
    return {
      text,
      entry: {
        uri: GATEWAY_SKILL_URI,
        frontmatter,
        resources: [{ uri: GATEWAY_SKILL_URI, digest: `sha256:${await sha256(text)}` }],
      },
    }
  })()
  return cachedSkill
}

export function assertSkillUri(value: unknown): asserts value is typeof GATEWAY_SKILL_URI {
  if (value !== GATEWAY_SKILL_URI) {
    throw new GatewayError("INVALID_INPUT", "Unknown skill resource URI.")
  }
}
