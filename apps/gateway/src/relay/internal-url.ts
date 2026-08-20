import { networkInterfaces } from "node:os"
import { GatewayError } from "@cg/core"

export function detectInternalRelayUrl(
  port: number,
  options: { production: boolean; interfaces?: ReturnType<typeof networkInterfaces> },
): string {
  const interfaces = options.interfaces ?? networkInterfaces()
  const privateAddresses: string[] = []
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family !== "IPv4" || entry.internal) continue
      if (isPrivateIpv4(entry.address)) privateAddresses.push(entry.address)
    }
  }
  privateAddresses.sort(preferDockerOverlay)
  const address = privateAddresses[0]
  if (address !== undefined) return `http://${address}:${port}`
  if (!options.production) return `http://127.0.0.1:${port}`
  throw new GatewayError("INTERNAL", "No private relay interface is available for multi-instance routing.")
}

function isPrivateIpv4(address: string): boolean {
  const parts = address.split(".").map(Number)
  if (parts.length !== 4) return false
  const [a, b] = parts as [number, number, number, number]
  return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

/** Docker overlay networks commonly use 10/8; prefer them over bridge/LAN 172/192. */
function preferDockerOverlay(a: string, b: string): number {
  return Number(!a.startsWith("10.")) - Number(!b.startsWith("10.")) || a.localeCompare(b)
}
