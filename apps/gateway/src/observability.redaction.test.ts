/**
 * The end-to-end guard on "a raw credential never reaches a log line".
 *
 * `@cg/observability` cannot depend on `@cg/auth` — it sits under it, and the
 * package that protects the credential must not import the one that mints it.
 * So its own tests spell the token grammar out by hand, which proves the regex
 * matches a string the test wrote, not a string the product issues. This file
 * is where the two meet: the gateway depends on both, so it can mint a REAL key
 * with `formatToken`/`newCredentialSecret` and push it through the REAL logger.
 *
 * If the credential format ever moves and the redactor is not moved with it,
 * every assertion here fails — instead of the leak being discovered in a log
 * aggregator, which is the one place a leaked key is most durable.
 */
import { describe, expect, test } from "bun:test"
import { TOKEN_PREFIXES, formatToken, newCredentialSecret } from "@cg/auth"
import { REDACTED, createLogger } from "@cg/observability"

/** Exactly what `features/api_keys/mutations:issue` hands an AI client. */
function mintApiKey(): string {
  const keyId = `key_${crypto.randomUUID().replaceAll("-", "")}`
  return formatToken(TOKEN_PREFIXES.apiKey, keyId, newCredentialSecret())
}

function mintDeviceCredential(): string {
  return formatToken(TOKEN_PREFIXES.device, "dev_ab12", newCredentialSecret())
}

/** Collects the serialised lines the logger would have written to stderr. */
function collectingLogger(): { lines: string[]; logger: ReturnType<typeof createLogger> } {
  const lines: string[] = []
  return { lines, logger: createLogger("test", { write: (line) => lines.push(line) }) }
}

/** The half that is actually secret — the part after the LAST separator. */
function secretHalf(token: string): string {
  return token.slice(token.lastIndexOf("_") + 1)
}

describe("a real credential never survives the logger", () => {
  test("not as a bare value in the message, with no field name to key off", () => {
    for (const token of [mintApiKey(), mintDeviceCredential()]) {
      const { lines, logger } = collectingLogger()
      // No "bearer", no sensitive field name: the two pre-existing rules miss
      // this shape entirely, which is exactly why the third one exists.
      logger.warn(`rejected credential ${token} from an unknown caller`)

      const line = lines.join("")
      expect(line).not.toContain(token)
      expect(line).not.toContain(secretHalf(token))
      expect(line).toContain(REDACTED)
    }
  })

  test("not under an innocuous field name, in an array, or inside an Error", () => {
    const token = mintApiKey()
    const { lines, logger } = collectingLogger()

    logger.error("upstream refused", {
      // None of these key names match the sensitive-key rule.
      note: `client sent ${token}`,
      attempted: [token],
      cause: new Error(`invalid credential: ${token}`),
      nested: { deeper: { value: token } },
    })

    const line = lines.join("")
    expect(line).not.toContain(token)
    expect(line).not.toContain(secretHalf(token))
  })

  test("not through a child logger's inherited base fields", () => {
    const token = mintApiKey()
    const { lines, logger } = collectingLogger()

    logger.child({ presented: token }).info("request start")

    expect(lines.join("")).not.toContain(token)
  })

  test("the surrounding message is still readable", () => {
    const token = mintApiKey()
    const { lines, logger } = collectingLogger()

    logger.warn(`rejected ${token} for connector careerpack`)

    const line = lines.join("")
    expect(line).toContain("rejected")
    expect(line).toContain("for connector careerpack")
    expect(line).toContain(REDACTED)
  })
})
