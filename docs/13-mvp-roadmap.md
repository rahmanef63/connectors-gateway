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

Not yet demonstrated end to end: it needs a stored connection and the confirmed
upstream tool names (see `adapters/careerpack/src/upstream.ts`).

## Phase 2 — device relay

- [x] Device pairing.
- [x] Device credential storage.
- [x] Outbound agent session.
- [x] Presence / heartbeat.
- [x] Signed job delivery.
- [x] Timeout and cancellation.
- [~] Remote revocation — a revoked device fails its next `hello` and can no longer be
      selected for a job, but an already-open socket is not closed. See gap 1 below.

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

- [x] Connections page — lists stored connections and status. No OAuth connect flow yet.
- [x] Devices page.
- [x] Connector permissions.
- [x] Audit log.
- [ ] Approval UI — the policy layer returns `REQUIRE_APPROVAL`, but no approval record is
      persisted, so the action is refused at call time rather than queued. See gap 3.
- [x] Setup page for AI clients.

## Known gaps after wave 1

1. **Revocation does not close a live socket.** The relay reads the control plane only at
   connect time. The open session is inert — dispatch rejects with `DEVICE_REVOKED` and
   presence updates are dropped — but `docs/04` is not literally satisfied. Needs a relay
   sweep or a push channel.
2. **Audit rows carry no `deviceId` / `connectionId`.** `ExecutionResult` does not carry
   them back, so the pipeline cannot populate the optional fields `docs/10` allows.
3. **No approval persistence.** `REQUIRE_APPROVAL` is evaluated and audited but never
   queued, so there is nothing for an approvals screen to show.
4. **An MCP `tools/call` for a name outside the caller's catalog writes no audit row**,
   because it is rejected before the execution pipeline. The REST path does audit the
   equivalent miss.
5. **Rate limits, relay presence and the agent's replay guard are per-process.** A second
   gateway instance multiplies every limit and forgets seen job ids across a restart.
   Each site is marked `ponytail:`. Correct for a single-instance MVP, load-bearing before
   horizontal scaling — `docs/12` already calls this out.

## Not yet proven against real systems

Everything above is verified by unit tests, `convex-test` and a production `next build`.
Nothing has run against a live Convex deployment, a real CareerPack tenant, or a real
Blender install.

## Explicitly out of MVP

- marketplace;
- billing;
- public connector submissions;
- workflow builder;
- multi-step automation engine;
- dozens of SaaS connectors;
- arbitrary shell execution;
- offline job queue unless proven necessary.
