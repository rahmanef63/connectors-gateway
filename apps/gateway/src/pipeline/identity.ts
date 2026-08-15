/**
 * docs/05: "Do not let the AI supply user_id, workspace_id, device id, or
 * policy fields directly."
 *
 * Identity is attached server-side from the authenticated principal, so any
 * identity-shaped key in the AI's arguments is stripped before an adapter can
 * see it. The denylist is deliberately narrow and unambiguous — `role`,
 * `company` and `name` are legitimate business fields and must survive.
 *
 * ponytail: top level only. Every shipped manifest uses
 * `additionalProperties: false`, so schema validation already rejects these
 * keys; this is the second line of defence for a future open schema. Upgrade
 * path if one ever ships: recurse with a depth cap.
 */

const IDENTITY_KEYS: ReadonlySet<string> = new Set([
  "userid",
  "workspaceid",
  "deviceid",
  "orgid",
  "organizationid",
  "tenantid",
  "accountid",
  "principal",
  "actor",
  "actorid",
  "caller",
  "callerid",
  "scopes",
  "policy",
  "policydecision",
  "requestcontext",
  "onbehalfof",
  "impersonate",
  "impersonateas",
])

/** `user_id`, `user-id`, `userId` and `USERID` are the same key to an attacker. */
export function normalizeKey(key: string): string {
  return key.toLowerCase().replaceAll("_", "").replaceAll("-", "")
}

export function isIdentityKey(key: string): boolean {
  return IDENTITY_KEYS.has(normalizeKey(key))
}

export type StripResult = { input: unknown; stripped: string[] }

export function stripIdentityFields(input: unknown): StripResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { input, stripped: [] }
  }

  const stripped: string[] = []
  // Null-prototype accumulator. `JSON.parse('{"__proto__":{…}}')` yields an OWN
  // `__proto__` key, and copying it onto a normal `{}` would invoke the
  // Object.prototype setter and hand the adapter an object whose prototype the
  // caller chose. A closed inputSchema rejects that key today, which is exactly
  // the assumption this second line of defence exists to survive.
  const clean: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (isIdentityKey(key)) {
      // The KEY is recorded (it is a fixed vocabulary); the value never is.
      stripped.push(normalizeKey(key))
      continue
    }
    clean[key] = value
  }
  return { input: clean, stripped }
}
