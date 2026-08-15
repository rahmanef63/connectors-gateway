/**
 * CLI entry point: `pair | run | status | revoke-local`.
 *
 * Dispatch only — the commands themselves live in commands.ts so they stay
 * testable without spawning a process.
 */
import { GatewayError } from "@cg/core"
import { pairCommand, revokeLocalCommand, runCommand, statusCommand } from "./commands"
import { AGENT_VERSION } from "./identity"

const USAGE = `connectors agent ${AGENT_VERSION}

  agent pair           pair this machine with a gateway account
  agent run            open the outbound session and serve jobs
  agent status         show device id, connection state and adapters
  agent revoke-local   delete the device credential stored on this machine

Environment:
  CG_GATEWAY_URL       relay endpoint, ws:// or wss:// (outbound only)
  CG_CONFIG_DIR        credential store directory (default ~/.connectors-agent)
  BLENDER_BRIDGE_URL   loopback Blender bridge, e.g. http://127.0.0.1:9876`

export async function main(argv: readonly string[]): Promise<number> {
  const command = argv[0]
  try {
    switch (command) {
      case "pair":
        await pairCommand()
        return 0
      case "run":
        await runCommand()
        // The open socket keeps the runtime alive; the session reconnects itself.
        return 0
      case "status":
        await statusCommand()
        return 0
      case "revoke-local":
        revokeLocalCommand()
        return 0
      case "help":
      case "--help":
      case "-h":
        console.log(USAGE)
        return 0
      default:
        console.error(command === undefined ? "No command given.\n" : "Unknown command.\n")
        console.error(USAGE)
        return 1
    }
  } catch (cause) {
    // GatewayError messages are written to be safe to show; anything else is not.
    console.error(cause instanceof GatewayError ? `error: ${cause.message}` : "error: the agent failed to start.")
    return 1
  }
}

process.exitCode = await main(process.argv.slice(2))
