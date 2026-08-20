import { afterEach, describe, expect, test } from "vitest"
import { errorCodeOf } from "./errors"
import { assertUpstreamUrl } from "./upstream_url"

function codeOf(value: string): string | null {
  try {
    assertUpstreamUrl(value)
    return null
  } catch (error) {
    return errorCodeOf(error)
  }
}

const ORIGINAL_SITE_URL = process.env.CONVEX_SITE_URL

afterEach(() => {
  delete process.env.ALLOW_LOOPBACK_UPSTREAM
  delete process.env.UPSTREAM_BLOCKED_HOSTS
  if (ORIGINAL_SITE_URL === undefined) delete process.env.CONVEX_SITE_URL
  else process.env.CONVEX_SITE_URL = ORIGINAL_SITE_URL
})

/** One row per SSRF class. The label is what shows up in a failure report. */
const BLOCKED: Array<[string, string]> = [
  ["plain http", "http://example.convex.site/mcp"],
  ["ftp", "ftp://example.convex.site/mcp"],
  ["file", "file:///etc/passwd"],
  ["javascript", "javascript:alert(1)"],
  ["data", "data:text/plain,hello"],
  ["credentials in the url", "https://user:pass@example.com"],
  ["password only", "https://:pass@example.com/mcp"],
  ["cloud metadata over http", "http://169.254.169.254/latest/meta-data"],
  ["cloud metadata over https", "https://169.254.169.254/latest/meta-data"],
  ["link-local", "https://169.254.1.1/mcp"],
  ["10/8", "https://10.0.0.5/mcp"],
  ["172.16/12 low edge", "https://172.16.0.1/mcp"],
  ["172.16/12 high edge", "https://172.31.255.255/mcp"],
  ["192.168/16", "https://192.168.1.10/mcp"],
  ["127/8 loopback", "https://127.0.0.1/mcp"],
  ["127/8 alternate", "https://127.1.2.3/mcp"],
  ["0.0.0.0/8", "https://0.0.0.0/mcp"],
  ["loopback as an integer", "https://2130706433/mcp"],
  ["loopback in hex", "https://0x7f.1/mcp"],
  ["localhost without the dev flag", "https://localhost/mcp"],
  ["ipv6 loopback", "https://[::1]/mcp"],
  ["ipv6 unspecified", "https://[::]/mcp"],
  ["ipv6 unique-local fc00::/7", "https://[fc00::1]/mcp"],
  ["ipv6 unique-local fd00", "https://[fd12:3456:789a::1]/mcp"],
  ["ipv6 link-local fe80::/10", "https://[fe80::1]/mcp"],
  ["ipv4-mapped loopback", "https://[::ffff:127.0.0.1]/mcp"],
  ["ipv4-mapped metadata", "https://[::ffff:169.254.169.254]/mcp"],
  ["ipv4-mapped metadata in hex", "https://[::ffff:a9fe:a9fe]/mcp"],
  ["ipv4-mapped 10/8", "https://[::ffff:10.1.2.3]/mcp"],
  ["ipv4-mapped 192.168/16", "https://[::ffff:192.168.0.1]/mcp"],
  ["ipv4-mapped 172.16/12", "https://[::ffff:172.20.0.1]/mcp"],
  ["ipv4-compatible loopback", "https://[::127.0.0.1]/mcp"],
  ["own convex api host", "https://api-connectors.rahmanef.com/mcp"],
  ["own convex site host", "https://site-connectors.rahmanef.com/http"],
  ["own convex dashboard host", "https://dash-connectors.rahmanef.com"],
  ["own gateway host", "https://connect.rahmanef.com/mcp"],
  ["non-standard port", "https://example.convex.site:8080/mcp"],
  ["port 80 explicitly", "https://example.convex.site:80/mcp"],
  // The DNS root label. Every one of these reaches exactly the host the row
  // above it forbids, so a trailing dot must not be a way around any of them.
  ["localhost with a trailing dot", "https://localhost./mcp"],
  ["localhost with several trailing dots", "https://localhost../mcp"],
  ["loopback literal with a trailing dot", "https://127.0.0.1./mcp"],
  ["metadata with a trailing dot", "https://169.254.169.254./mcp"],
  ["10/8 with a trailing dot", "https://10.0.0.5./mcp"],
  ["own convex api host with a trailing dot", "https://api-connectors.rahmanef.com./mcp"],
  ["own gateway host with a trailing dot", "https://connect.rahmanef.com./mcp"],
  ["own gateway host, trailing dot and mixed case", "HTTPS://Connect.RahmaNef.CoM./mcp"],
  ["a bare root label", "https://./mcp"],
  ["relative, not absolute", "/mcp"],
  ["empty", ""],
  ["over-long", `https://public-mcp.example.net/${"a".repeat(2100)}`],
]

describe("assertUpstreamUrl — blocked", () => {
  test.each(BLOCKED)("rejects %s", (_label, value) => {
    expect(codeOf(value)).toBe("INVALID_INPUT")
  })

  test("never echoes the rejected value back to the caller", () => {
    try {
      assertUpstreamUrl("https://admin:hunter2@10.0.0.5/mcp")
      throw new Error("expected a rejection")
    } catch (error) {
      const message = String((error as { data?: { message?: string } }).data?.message)
      expect(message).not.toContain("hunter2")
      expect(message).not.toContain("10.0.0.5")
    }
  })

  test("a self host set through env is blocked too", () => {
    process.env.UPSTREAM_BLOCKED_HOSTS = " internal.example.test , other.example.test "
    expect(codeOf("https://internal.example.test/mcp")).toBe("INVALID_INPUT")
    // Setting the var must not drop the built-in defaults.
    expect(codeOf("https://connect.rahmanef.com/mcp")).toBe("INVALID_INPUT")
  })

  test("this deployment's own Convex host is blocked wherever it lives", () => {
    process.env.CONVEX_SITE_URL = "https://site-example.rahmanef.com"
    expect(codeOf("https://site-example.rahmanef.com/http")).toBe("INVALID_INPUT")
  })
})

describe("assertUpstreamUrl — accepted", () => {
  test("accepts a legitimate Convex MCP endpoint unchanged", () => {
    expect(assertUpstreamUrl("https://public-mcp.example.net/mcp")).toBe(
      "https://public-mcp.example.net/mcp",
    )
  })

  test("accepts public addresses next to the blocked ranges", () => {
    for (const value of [
      "https://172.15.0.1/mcp",
      "https://172.32.0.1/mcp",
      "https://11.0.0.1/mcp",
      "https://192.167.0.1/mcp",
      "https://[2001:db8::1]/mcp",
      "https://public-mcp.example.net:8443/mcp",
    ]) {
      expect(codeOf(value)).toBeNull()
    }
  })

  test("normalises to origin + path so one endpoint cannot be spelled twice", () => {
    const canonical = "https://public-mcp.example.net/mcp"
    for (const spelling of [
      "https://public-mcp.example.net/mcp/",
      "https://PUBLIC-MCP.example.net/mcp",
      "https://public-mcp.example.net:443/mcp",
      "https://public-mcp.example.net/mcp?token=abc#frag",
      "  https://public-mcp.example.net//mcp//  ",
      // The root label is dropped rather than merely tolerated, so the same
      // endpoint spelled with and without it cannot become two connection rows.
      "https://public-mcp.example.net./mcp",
      "HTTPS://Public-Mcp.Example.Net.:443/mcp/",
    ]) {
      expect(assertUpstreamUrl(spelling)).toBe(canonical)
    }
    expect(assertUpstreamUrl("https://public-mcp.example.net/")).toBe("https://public-mcp.example.net")
  })

  test("an uppercase scheme is the same scheme", () => {
    expect(assertUpstreamUrl("HTTPS://public-mcp.example.net/mcp")).toBe(
      "https://public-mcp.example.net/mcp",
    )
    // …and uppercasing it is not a way to smuggle a forbidden one past the check.
    for (const value of ["HTTP://example.convex.site/mcp", "FILE:///etc/passwd"]) {
      expect(codeOf(value)).toBe("INVALID_INPUT")
    }
  })
})

describe("assertUpstreamUrl — loopback dev flag", () => {
  test("http on loopback is allowed only when the flag is set", () => {
    expect(codeOf("http://localhost:3000/mcp")).toBe("INVALID_INPUT")
    process.env.ALLOW_LOOPBACK_UPSTREAM = "1"
    expect(assertUpstreamUrl("http://localhost:3000/mcp")).toBe("http://localhost:3000/mcp")
    expect(assertUpstreamUrl("http://127.0.0.1:8080/mcp")).toBe("http://127.0.0.1:8080/mcp")
    expect(codeOf("http://[::1]:8080/mcp")).toBeNull()
  })

  test("the flag does not unlock non-loopback private ranges", () => {
    process.env.ALLOW_LOOPBACK_UPSTREAM = "1"
    for (const value of [
      "http://169.254.169.254/latest/meta-data",
      "http://10.0.0.5/mcp",
      "http://192.168.1.10/mcp",
      "http://example.convex.site/mcp",
    ]) {
      expect(codeOf(value)).toBe("INVALID_INPUT")
    }
  })

  test("the flag is default-deny for any value other than 1/true", () => {
    process.env.ALLOW_LOOPBACK_UPSTREAM = "no"
    expect(codeOf("http://localhost:3000/mcp")).toBe("INVALID_INPUT")
  })
})
