/** Shared OAuth client metadata accepted by the gateway and control plane. */
export const OAUTH_APPLICATION_TYPES = Object.freeze(["web", "native"] as const)
export type OAuthApplicationType = (typeof OAUTH_APPLICATION_TYPES)[number]

export function normalizeOAuthApplicationType(value: unknown): OAuthApplicationType | null {
  return value === "web" || value === "native" ? value : null
}
