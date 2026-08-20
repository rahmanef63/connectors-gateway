# MVP roadmap

Status legend: `[x]` implemented and covered by tests, `[~]` partially implemented,
`[ ]` not started. "Implemented" means the code exists and its tests pass — see
**Not yet proven against real systems** at the bottom for what that does *not* mean.

## Phase 0 — contracts

- [x] Freeze connector manifest shape.
- [x] Freeze action/risk metadata.
- [x] Define gateway error model.
- [x] Define device/job envelopes.
- [x] Add JSON schema validation.
- [x] Add contract tests.

## Phase 1 — cloud proof

- [x] Implement gateway request router.
- [x] Implement identity attachment.
- [x] Implement policy evaluation.
- [x] Implement `careerpack` adapter.
- [x] Expose at least one read and one write action.
- [x] Add audit logging.

Success condition:

```text
AI → Gateway → CareerPack → Gateway → AI
```

**Demonstrated against the live stack on 2026-08-15**, with one caveat. A real call ran
the whole chain: API key → `authenticateCaller` → policy `ALLOW` (R0) → the connection's
sealed token decrypted inside the gateway → a real HTTPS request to CareerPack → the
upstream's answer mapped to a normalised result → exactly one audit row carrying the
decision, status and latency.

The caveat is the credential, not the code: the stored token is a placeholder, so CareerPack
answered `401` and the chain ended in `UPSTREAM_ERROR`. A green call needs a row in
CareerPack's own `oauthAccessTokens` — its `MCP_API_KEY` resolves to `userId: null` and every
`tools/call` is refused. The upstream tool names ARE now confirmed against that server's
source (`profile_get`, `applications_create`) and live in each action's `x-upstream`.

## Phase 2 — device relay

- [x] Device pairing.
- [x] Device credential storage.
- [x] Outbound agent session.
- [x] Presence / heartbeat.
- [x] Signed job delivery.
- [x] Timeout and cancellation.
- [x] Remote revocation — a revoked device fails its next `hello`, disappears from
      dispatch immediately after relay revalidation, active jobs fail with `DEVICE_REVOKED`,
      and the socket closes with code 4003. Revalidation runs every 30 seconds.
- [x] Presence survives the gateway dying. `status: "online"` is a claim with an expiry,
      not a fact: the relay re-stamps `lastSeenAt` on a throttled heartbeat, and every
      reader treats a device as online only while that stamp is inside
      `PRESENCE_TTL_MS`. Before this, a crash or a deploy — which happens on every push —
      left the disconnect handler unrun and every connected device permanently `online`,
      so the dashboard showed phantoms and `selectDevice` routed jobs to a device with no
      socket. Enforced on read, so nothing has to sweep for it to be correct.

Success condition:

```text
Gateway can securely ask a paired agent to return a health response.
```

## Phase 3 — Blender proof

- [x] Detect Blender.
- [x] Connect to Blender bridge on localhost.
- [x] `scene.inspect`.
- [x] `scene.render`.
- [x] Return render result safely.
- [x] Deny arbitrary code by default.

Success condition:

```text
AI → Gateway → paired PC → Blender → rendered result → AI
```

The adapter and the add-on are written and unit-tested against a stubbed bridge. They
have not been run against a real Blender install.

## Phase 4 — product UX

- [x] Connections page — a catalog of cards, and Connect runs a real OAuth 2.1
      authorization-code flow (PKCE S256, RFC 9728 + RFC 8414 discovery, RFC 7591
      registration when the server offers it, RFC 8707 `resource`). The user is asked for
      at most a client id and a client secret, and for nothing at all where the server
      registers clients on demand. Credentials are sealed by the dashboard, so the old
      "SSH to the gateway host and run `seal`" step is gone.
- [x] Devices page.
- [x] Connector permissions.
- [x] Audit log.
- [x] Approval UI — `REQUIRE_APPROVAL` creates one short-lived row keyed by connector,
      action and canonicalised arguments. Approve/deny never executes the call; the next exact
      retry atomically spends an approval once. The queue is capped and expired rows are swept.
- [x] Setup page for AI clients.
- [x] API-key issuance uses an indexed active-key cap; an arbitrarily long revoked-key
      history remains queryable without blocking key rotation.

## Known gaps after wave 1

1. ~~**Revocation does not close a live socket.**~~ **Closed 2026-08-20.** The relay
   revalidates connected device rows every 30 seconds. A missing/revoked row is removed from
   the socket registry before close, all pending jobs fail as `DEVICE_REVOKED`, and the agent
   receives close code 4003. Reads are reconnect-safe and a temporary control-plane error is
   retried rather than disconnecting a healthy device.
2. ~~**Audit rows carry no `deviceId` / `connectionId`.**~~ **Closed 2026-08-20.**
   Executors return audit-only attribution after selecting a trusted connection or device. The
   pipeline persists it, bounds the identifiers, and rebuilds the public result from an explicit
   allowlist so neither identifier leaks through REST or MCP.
3. ~~**No approval persistence.**~~ **Closed 2026-08-16; hardened 2026-08-20.** The gateway
   queues an exact-call hash, the dashboard can approve or deny it, and the next matching call
   consumes it atomically. A denial cannot be revived by retrying. The 100-row cap is enforced
   before insertion, and expired rows are removed by bounded hourly maintenance.
4. ~~**An MCP `tools/call` for a name outside the caller's catalog writes no audit row.**~~
   **Closed.** The refusal still happens before the execution pipeline — `tool-names.ts`
   ships no reverse function, so an invented name must not reach it — but the MCP handler
   now writes the row itself before rethrowing. The row carries the caller-supplied name
   through `safeId`, and `executorKind: "none"`, a value a manifest cannot declare: the
   request never reached an executor, and writing `cloud` for it would be a lie in the one
   table that exists to be trusted.
5. ~~**No upstream token refresh.**~~ **Closed 2026-08-20.** Authorization-code and
   client-credentials connects preserve expiry plus one sealed renewal document. The gateway
   starts refresh one minute early, wins a 20-second Convex lease, exchanges directly with the
   reviewed HTTPS token endpoint, seals access and rotated refresh tokens immediately, and
   commits by credential generation. Concurrent gateways wait for the winner; stale commits
   cannot overwrite it. `invalid_grant` / `invalid_client` expire the connection, while network,
   429 and 5xx failures release the lease for retry. Redirects, local/private endpoints,
   oversized bodies and malformed success documents fail closed without logging a secret.
6. ~~**A connector's `endpoint` can silently name a development deployment.**~~
   **Closed 2026-08-20.** Every shipped fixed endpoint now pins its reviewed production
   resource-metadata URL, authorization server, browser authorization endpoint, token endpoint,
   and registration endpoint. `bun run verify:remote-endpoints` performs an unauthenticated,
   redirect-free, bounded live probe of the complete chain. It runs on relevant pull requests,
   on changes to `main`, and every day. This specifically rejects the former
   `https://careerpack.local/oauth/authorize` failure mode without reading any credential.
7. **Rate limits, relay presence and the agent's replay guard are per-process.** A second
   gateway instance multiplies every limit and forgets seen job ids across a restart.
   Each site is marked `ponytail:`. Correct for a single-instance MVP, load-bearing before
   horizontal scaling — `docs/12` already calls this out.

## What is proven against real systems

Deployed 2026-08-15 (see `docs/12-deployment.md` for the topology).

Proven end to end against the live stack:

- the dashboard boots and its auth gate works — `/devices` redirects to
  `/sign-in?next=%2Fdevices`, and Convex serves `.well-known/jwks.json`;
- the gateway boots, `/healthz` answers, and `/mcp` rejects an unauthenticated
  caller with 401;
- **gateway → Convex works**: `POST /v1/pair/start` created a challenge that reads
  back out of the database with the right fields, and the same query with a wrong
  `serviceToken` is rejected by `requireService`;
- `/v1/pair/claim` gives the same answer for an unknown challenge id as for an
  unapproved one, so it is not an enumeration oracle.

- **the front door works**: an API key is minted, `listMine` returns metadata with no
  secret, the live gateway accepts the key, and a wrong secret, an unknown key id and a
  revoked key all return an identical `401` — so it is not an existence oracle;
- **the SSRF gate holds**: `169.254.169.254`, `10.0.0.1`, `192.168.1.5`, the IPv4-mapped
  IPv6 form, a userinfo URL and a URL pointing back at our own Convex deployment are all
  rejected, while a real `*.convex.site/mcp` is accepted;
- **the cloud chain runs end to end** — see Phase 1 above. The catalog only lists a
  connector once a connection row exists, which is the `docs/07` intersection working.

Still unproven:

- **no device has ever paired.** The browser approval step and the agent's outbound
  session have not been exercised against the live gateway.
- **no job has ever been dispatched**, so the relay, the signed envelope and the
  agent's local allowlist are untested outside unit tests.
- **no upstream has ever answered successfully.** CareerPack is connected and reachable,
  but with a placeholder credential; the one thing never observed is a `200` coming back
  through the chain with real data in it.
- **Blender has never been driven.** The add-on has not been installed in a real
  Blender. Per the owner's 2026-08-15 decision the relay is a feature, not the product,
  so this is parked rather than next.

## Explicitly out of MVP

- marketplace;
- billing;
- public connector submissions;
- workflow builder;
- multi-step automation engine;
- dozens of SaaS connectors;
- arbitrary shell execution;
- offline job queue unless proven necessary.
