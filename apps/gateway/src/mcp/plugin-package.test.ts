import { describe, expect, test } from "bun:test"
import { SERVER_INFO } from "./server"

const root = new URL("../../../../", import.meta.url)

async function readJson(relative: string): Promise<Record<string, unknown>> {
  return JSON.parse(await Bun.file(new URL(relative, root)).text()) as Record<string, unknown>
}

function at(value: unknown, key: string): Record<string, unknown> {
  expect(value).toBeObject()
  const nested = (value as Record<string, unknown>)[key]
  expect(nested).toBeObject()
  return nested as Record<string, unknown>
}

describe("universal plugin package", () => {
  test("the Codex manifest matches the runtime version and points only at existing paths", async () => {
    const manifest = await readJson("plugin/.codex-plugin/plugin.json")
    const gatewayPackage = await readJson("apps/gateway/package.json")
    expect(manifest.name).toBe("connectors-gateway")
    expect(manifest.version).toBe(SERVER_INFO.version)
    expect(gatewayPackage.version).toBe(SERVER_INFO.version)
    expect(manifest.skills).toBe("./skills/")
    expect(manifest.mcpServers).toBe("./.mcp.openai.json")

    for (const key of ["skills", "mcpServers"] as const) {
      const relative = manifest[key]
      expect(relative).toBeString()
      expect(relative as string).toStartWith("./")
    }
    expect(await Bun.file(new URL("plugin/skills/connectors-gateway/SKILL.md", root)).exists()).toBe(true)
    expect(await Bun.file(new URL("plugin/.mcp.openai.json", root)).exists()).toBe(true)

    const interfaceMetadata = at(manifest, "interface")
    expect(interfaceMetadata.displayName).toBe("Connectors Gateway")
    expect(interfaceMetadata.capabilities).toEqual(["Read", "Write"])
    expect(interfaceMetadata.brandColor).toBe("#F5B544")
  })

  test("OpenAI gets a direct OAuth server map with write-aware approvals", async () => {
    const config = await readJson("plugin/.mcp.openai.json")
    const gateway = at(config, "gateway")
    expect(gateway).toMatchObject({
      url: "https://connect.rahmanef.com/mcp",
      auth: "oauth",
      default_tools_approval_mode: "writes",
      scopes_supported: ["mcp.read", "mcp.write"],
    })
    expect(config.mcpServers).toBeUndefined()
    expect(config.mcp_servers).toBeUndefined()
  })

  test("the repo marketplace resolves the plugin relative to the repository root", async () => {
    const marketplace = await readJson(".agents/plugins/marketplace.json")
    expect(marketplace.name).toBe("rahmanef-connectors")
    const plugins = marketplace.plugins as Array<Record<string, unknown>>
    expect(plugins).toHaveLength(1)
    expect(plugins[0]).toMatchObject({
      name: "connectors-gateway",
      source: { source: "local", path: "./plugin" },
      policy: { installation: "AVAILABLE", authentication: "ON_INSTALL" },
    })
    expect(await Bun.file(new URL("plugin/.codex-plugin/plugin.json", root)).exists()).toBe(true)
  })

  test("Claude keeps its native wrapper and shares the same package version", async () => {
    const manifest = await readJson("plugin/.claude-plugin/plugin.json")
    const config = await readJson("plugin/.mcp.json")
    expect(manifest.version).toBe(SERVER_INFO.version)
    expect(config).toMatchObject({
      mcpServers: {
        gateway: { type: "http", url: "https://connect.rahmanef.com/mcp" },
      },
    })
  })

  test("a hosted ChatGPT app mapping can never be committed as a placeholder", async () => {
    const appPath = new URL("plugin/.app.json", root)
    const manifest = await readJson("plugin/.codex-plugin/plugin.json")
    if (!(await Bun.file(appPath).exists())) {
      expect(manifest.apps).toBeUndefined()
      return
    }

    expect(manifest.apps).toBe("./.app.json")
    const text = await Bun.file(appPath).text()
    expect(text).toMatch(/plugin_asdk_app_[a-zA-Z0-9]+/)
    expect(text).not.toMatch(/placeholder|replace[_ -]?me|example/i)
  })
})
