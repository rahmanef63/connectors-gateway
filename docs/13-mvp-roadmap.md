# MVP roadmap

## Phase 0 — contracts

- [ ] Freeze connector manifest shape.
- [ ] Freeze action/risk metadata.
- [ ] Define gateway error model.
- [ ] Define device/job envelopes.
- [ ] Add JSON schema validation.
- [ ] Add contract tests.

## Phase 1 — cloud proof

- [ ] Implement gateway request router.
- [ ] Implement identity attachment.
- [ ] Implement policy evaluation.
- [ ] Implement `careerpack` adapter.
- [ ] Expose at least one read and one write action.
- [ ] Add audit logging.

Success condition:

```text
AI → Gateway → CareerPack → Gateway → AI
```

## Phase 2 — device relay

- [ ] Device pairing.
- [ ] Device credential storage.
- [ ] Outbound agent session.
- [ ] Presence / heartbeat.
- [ ] Signed job delivery.
- [ ] Timeout and cancellation.
- [ ] Remote revocation.

Success condition:

```text
Gateway can securely ask a paired agent to return a health response.
```

## Phase 3 — Blender proof

- [ ] Detect Blender.
- [ ] Connect to Blender bridge on localhost.
- [ ] `scene.inspect`.
- [ ] `scene.render`.
- [ ] Return render result safely.
- [ ] Deny arbitrary code by default.

Success condition:

```text
AI → Gateway → paired PC → Blender → rendered result → AI
```

## Phase 4 — product UX

- [ ] Connections page.
- [ ] Devices page.
- [ ] Connector permissions.
- [ ] Audit log.
- [ ] Approval UI.
- [ ] Setup page for AI clients.

## Explicitly out of MVP

- marketplace;
- billing;
- public connector submissions;
- workflow builder;
- multi-step automation engine;
- dozens of SaaS connectors;
- arbitrary shell execution;
- offline job queue unless proven necessary.
