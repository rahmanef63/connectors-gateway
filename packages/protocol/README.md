# packages/protocol

Wire contracts between gateway, relay, and agent.

Owns:

- job envelopes;
- heartbeat messages;
- capability announcements;
- result envelopes;
- protocol version;
- serialization validation;
- replay/expiry metadata.

Keep this independent from Blender.

## Runtime API

`src/types.ts` is the contract; the rest of `src` is the runtime that enforces it.
Import from the package barrel (`@cg/protocol`), never from an internal path.

| Export | Purpose |
| --- | --- |
| `canonicalJson(value)` | Deterministic signing preimage. Sorted keys, `undefined` keys dropped, arrays ordered. Rejects cycles, non-finite numbers, `undefined` array elements and non-plain objects with `INVALID_INPUT`. |
| `generateSigningKeyPair()` / `importPrivateKey(b64)` / `importPublicKey(b64)` | Ed25519 via WebCrypto. Private key is base64 PKCS#8, public key base64 SPKI. |
| `createJobEnvelope(input)` | Builds a `JobEnvelope` with a fresh id/nonce and an expiry. `MAX_JOB_TTL_MS` caps the window. |
| `signJob(payload, { privateKey, keyId })` | Returns a `SignedJob`; the signature is base64url over `canonicalJson(payload)`. |
| `verifyJob(signed, { publicKey, keyId, now })` | Signature first, then claims. `NOT_AUTHORIZED` for a wrong key id or bad signature, `TIMEOUT` for expiry or >`MAX_CLOCK_SKEW_MS` future issue time, `INVALID_INPUT` for a protocol mismatch. |
| `parseAgentMessage(raw)` / `parseGatewayMessage(raw)` | Validate a raw frame (max `MAX_FRAME_BYTES`) before any field is read. |
| `parseJobEnvelope(value)` / `parseSignedJob(value)` | Shape-only guards for a job that arrives outside a frame. |
| `createMemoryReplayGuard({ maxEntries })` | `ReplayGuard` for a single process; `remember` returns `false` for a job id already seen. |

Contracts worth knowing before you call this package:

- `verifyJob` does not consult the replay guard — the relay owns that call, so it
  can record the id exactly once after verification succeeds.
- `AgentResult` files must carry a bare file name. A name containing `/`, `\` or
  `:` is rejected by `parseAgentMessage` (docs/14: results must not leak local paths).
- The replay guard is in-memory: correct for one relay process only. Swap in a
  shared implementation of the same `ReplayGuard` port to scale horizontally.
