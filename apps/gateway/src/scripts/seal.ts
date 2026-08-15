/**
 * Seals one connector credential so it can be stored where it is never readable.
 *
 * The whole flow, end to end:
 *
 *   1. Get the upstream token — e.g. a CareerPack bearer from that app's settings.
 *   2. Seal it with the SAME key the gateway runs with:
 *
 *        # interactive: nothing is written to shell history
 *        $ bun run --cwd apps/gateway seal
 *        Paste the token, then press Enter and Ctrl-D:
 *        <paste>
 *        v1.Zm9vYmFyYmF6cXV4.3o8Xq...
 *
 *        # scripted: a heredoc, so the token is still not an argument
 *        $ bun run --cwd apps/gateway seal <<< "$CAREERPACK_TOKEN"
 *
 *   3. Copy the printed `v1.<iv>.<cipher>` line into the dashboard's connection form
 *      (connectors.rahmanef.com → Connections). It is stored verbatim as
 *      `connections.tokenCipher`; Convex never holds the key, so it cannot open it.
 *   4. The gateway opens it at execution time with `open()` from packages/auth and
 *      hands the plaintext to the adapter, and to nothing else.
 *
 * The token arrives on STDIN and never as an argv argument: `/proc/<pid>/cmdline` is
 * world-readable on Linux, so any local user can read the arguments of a running
 * process, and most shells persist them to history besides. Sealing must happen here
 * rather than in Convex or the browser because CREDENTIAL_ENCRYPTION_KEY exists only
 * in the gateway process (docs/03, docs/14).
 *
 * Only the sealed string is written to stdout. Every prompt, warning and error goes to
 * stderr, so `seal | pbcopy` copies exactly the ciphertext and nothing else.
 */
import { fromBase64Url, seal } from "@cg/auth"

const ENV_VAR = "CREDENTIAL_ENCRYPTION_KEY"
/** AES-256: the key is 32 bytes, whatever its base64 spelling. */
const KEY_BYTES = 32

function fail(message: string): never {
  process.stderr.write(`seal: ${message}\n`)
  process.exit(1)
}

if (process.argv.length > 2) {
  fail(
    "this command takes no arguments — the token is read from stdin.\n" +
      "  If you just passed a token as an argument, rotate it: it was world-readable in\n" +
      "  /proc while this ran, and your shell has almost certainly recorded it.",
  )
}

const keyB64 = process.env[ENV_VAR]
if (keyB64 === undefined || keyB64 === "") {
  fail(
    `${ENV_VAR} is not set.\n` +
      "  It must be the same key the gateway runs with, or the gateway cannot open what\n" +
      "  this seals. Generate one with: bun run --cwd apps/gateway keygen",
  )
}

const rawKey = fromBase64Url(keyB64)
if (rawKey === null) {
  fail(`${ENV_VAR} is not valid base64 (base64url and standard base64 are both accepted).`)
}
if (rawKey.length !== KEY_BYTES) {
  fail(`${ENV_VAR} decodes to ${rawKey.length} bytes; AES-256-GCM needs exactly ${KEY_BYTES}.`)
}

if (process.stdin.isTTY) {
  process.stderr.write("Paste the token, then press Enter and Ctrl-D:\n")
}

const token = (await Bun.stdin.text()).trim()
if (token.length === 0) {
  fail("no token on stdin. Pipe one in, or run without a pipe to paste it interactively.")
}
if (/[\r\n]/.test(token)) {
  fail("the token contains a line break — a bearer token is a single line. Nothing was sealed.")
}

let sealed: string
try {
  sealed = await seal(token, keyB64)
} catch {
  // seal() is deliberately opaque about crypto failures, so there is nothing to relay.
  fail(`sealing failed. Check that ${ENV_VAR} is a 32-byte AES key.`)
}

process.stdout.write(`${sealed}\n`)
