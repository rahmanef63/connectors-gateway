/**
 * POSIX permission checks for the device credential store (docs/03 "Local Agent":
 * store secrets in OS secure storage where possible).
 *
 * Split out from config.ts because "is this file private?" is a security decision
 * of its own, and it must be testable without touching a real home directory.
 */
import { statSync } from "node:fs"
import { GatewayError } from "@cg/core"

export const DIR_MODE = 0o700
export const FILE_MODE = 0o600

/** group (0o070) + other (0o007) bits. */
const GROUP_WORLD_BITS = 0o077

/** Errors never name a real path (AGENTS.md P0); the env var stands in for it. */
const FIX_HINT = 'Fix it with: chmod 700 "$CG_CONFIG_DIR" && chmod 600 "$CG_CONFIG_DIR/config.json".'

export function isGroupOrWorldAccessible(mode: number): boolean {
  return (mode & GROUP_WORLD_BITS) !== 0
}

/**
 * Windows synthesizes st_mode and always reports 0o666/0o777, so the check would
 * refuse to run for every Windows user. ACLs are the real control there.
 * ponytail: file perms now; OS keychain (DPAPI/Keychain/libsecret) when a second
 * platform needs it — that is also what fixes the Windows gap.
 */
export function supportsPosixModes(platform: string = process.platform): boolean {
  return platform !== "win32"
}

/**
 * Refuses to continue when the credential store is readable by anyone else.
 * `what` is a label ("credential store"), never a path.
 */
export function assertPrivateMode(
  mode: number,
  what: string,
  platform: string = process.platform,
): void {
  if (!supportsPosixModes(platform)) return
  if (isGroupOrWorldAccessible(mode)) {
    throw new GatewayError("NOT_AUTHORIZED", `The agent ${what} is group- or world-accessible. ${FIX_HINT}`)
  }
}

/** Stats `path` and applies {@link assertPrivateMode}. The path is never echoed. */
export function assertPrivatePath(path: string, what: string, platform: string = process.platform): void {
  if (!supportsPosixModes(platform)) return
  let mode: number
  try {
    mode = statSync(path).mode
  } catch {
    throw new GatewayError("INTERNAL", `The agent ${what} could not be inspected.`)
  }
  assertPrivateMode(mode, what, platform)
}
