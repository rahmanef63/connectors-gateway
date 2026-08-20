/**
 * Compatibility re-export for the Convex SSRF gate.
 * The canonical implementation lives in @cg/core so storage-time validation
 * and runtime remote-MCP transport cannot drift apart.
 */
export { blockedRange, isLoopback } from "@cg/core"
