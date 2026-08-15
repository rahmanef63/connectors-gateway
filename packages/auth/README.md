# packages/auth

Identity and credential primitives. All crypto is WebCrypto (`crypto.subtle`), so the
same code runs in Bun, Node 22 and the Convex runtime. No `node:crypto`, no dependency
beyond `@cg/core`.

Owns:

- authenticated actor context (`Principal` from `@cg/core`);
- credential hashing and constant-time verification;
- the AI-client API key and local-device credential formats;
- scope matching;
- envelope encryption for connection credentials at rest.

Does not own connector-specific OAuth implementation details unless they are genuinely generic.

## Public API (`@cg/auth`)

| Export | Purpose |
|---|---|
| `hashSecret(secret)` | `pbkdf2$sha256$210000$<saltB64url>$<hashB64url>` |
| `verifySecret(secret, stored)` | constant-time; false for wrong **and** malformed |
| `dummyStoredHash()` | valid throwaway hash, for equal-cost unknown-principal paths |
| `PBKDF2_ITERATIONS` | 210 000 |
| `TOKEN_PREFIXES` | `{ apiKey: "cgk", device: "cgd" }` |
| `formatToken` / `parseToken` / `isTokenPrefix` | `<prefix>_<id>_<secret>` |
| `newCredentialSecret(bytes?)` | 256-bit hex secret (hex because base64url contains `_`) |
| `parseAuthorizationHeader(header)` | Bearer, case-insensitive scheme |
| `authenticateCaller(token, lookup, now?)` | → `Principal`, else `NOT_AUTHENTICATED` |
| `ApiKeyLookup` / `ApiKeyRecord` / `ApiKeyStatus` | the control-plane port |
| `issueDeviceCredential(deviceId)` | `{ credential, credentialHash }` |
| `verifyDeviceCredential(credential, record)` | also rejects revoked devices |
| `DeviceCredentialRecord` / `IssuedDeviceCredential` | device credential shapes |
| `hasScopes(granted, required)` / `requireScopes(...)` | `*` and `connector:*` wildcards |
| `seal(plaintext, keyB64)` / `open(sealed, keyB64)` | AES-256-GCM, `v1.<iv>.<cipher>` |
| `toBase64Url` / `fromBase64Url` / `toHex` | codec helpers |

## Invariants

- Every caller failure — unknown key, wrong secret, revoked, expired, malformed,
  store outage — throws exactly `GatewayError("NOT_AUTHENTICATED", "Invalid credentials.")`.
  An unknown key is verified against `dummyStoredHash()` so it costs the same as a wrong secret.
- Every `secret-box` failure throws `GatewayError("INTERNAL", "Credential unavailable.")`.
  A crypto message would be a padding/tag oracle.
- Nothing here logs, and no error message ever embeds a token, id, or secret.
- The token id travels in clear so a record can be fetched by primary key; only the
  secret half is hashed.
