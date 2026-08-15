import { describe, expect, test } from "bun:test"
import { GatewayError } from "@cg/core"
import { httpBaseFrom, readAgentEnv, requireEnvGatewayUrl } from "./env"

describe("readAgentEnv", () => {
  test("reads and validates the three agent variables", () => {
    const env = readAgentEnv({
      CG_CONFIG_DIR: "/opt/agent",
      CG_GATEWAY_URL: "wss://gateway.example.com/device",
      BLENDER_BRIDGE_URL: "http://127.0.0.1:9876",
    })
    expect(env.configDir).toBe("/opt/agent")
    expect(env.gatewayUrl).toBe("wss://gateway.example.com/device")
    expect(env.blenderBridgeUrl).toBe("http://127.0.0.1:9876")
  })

  test("blank values are treated as unset", () => {
    const env = readAgentEnv({ CG_GATEWAY_URL: "   ", BLENDER_BRIDGE_URL: "" })
    expect(env.gatewayUrl).toBeUndefined()
    expect(env.blenderBridgeUrl).toBeUndefined()
  })

  test("DENIED: an http CG_GATEWAY_URL — the session is a WebSocket", () => {
    expect(() => readAgentEnv({ CG_GATEWAY_URL: "https://gateway.example.com" })).toThrow(GatewayError)
    expect(() => readAgentEnv({ CG_GATEWAY_URL: "gateway.example.com" })).toThrow(GatewayError)
  })
})

describe("requireEnvGatewayUrl", () => {
  test("pairing without CG_GATEWAY_URL is an actionable error", () => {
    try {
      requireEnvGatewayUrl(readAgentEnv({}))
      throw new Error("expected a throw")
    } catch (cause) {
      expect((cause as GatewayError).code).toBe("INVALID_INPUT")
      expect((cause as GatewayError).message).toContain("CG_GATEWAY_URL")
    }
  })
})

describe("httpBaseFrom", () => {
  test("maps the relay socket origin onto the pairing REST origin", () => {
    expect(httpBaseFrom("ws://localhost:8787/device")).toBe("http://localhost:8787")
    expect(httpBaseFrom("wss://gateway.example.com/device")).toBe("https://gateway.example.com")
    expect(httpBaseFrom("wss://gateway.example.com:9443/device")).toBe("https://gateway.example.com:9443")
  })

  test("DENIED: a non-WebSocket url", () => {
    expect(() => httpBaseFrom("http://gateway.example.com")).toThrow(GatewayError)
  })
})
