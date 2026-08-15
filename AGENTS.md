# AGENTS.md

## Goal

Build a secure connector runtime that exposes a single remote gateway to AI clients while supporting both:

- remote/cloud applications;
- local desktop applications.

## Read first

1. `docs/00-product-definition.md`
2. `docs/01-architecture.md`
3. `docs/03-security-model.md`
4. `docs/06-connector-contract.md`
5. `docs/13-mvp-roadmap.md`

If working on Blender, also read `docs/11-blender-reference.md`.

If working on the local agent, also read:

- `docs/04-device-pairing.md`
- `docs/05-local-agent-protocol.md`
- `docs/14-threat-model.md`

## Non-negotiable invariants

1. Local applications are never exposed through a raw public IP or inbound port.
2. The local agent initiates the network connection outbound.
3. Blender remains bound to loopback (`127.0.0.1` / `localhost`) unless an explicit future design changes this.
4. AI clients do not receive device credentials.
5. Connector credentials do not appear in tool output.
6. Authorization is checked per action, not only when a connection is established.
7. Dangerous capabilities such as arbitrary Python, shell execution, and unrestricted filesystem access are disabled by default.
8. Every action has explicit risk metadata.
9. Cloud and local connectors implement the same logical connector contract.
10. Protocol-specific details belong at adapters/edges; business-level action schemas stay normalized.
11. `rahmanef63/connectors` remains the cookbook/SSOT. Do not duplicate long-form recipes here when a link/reference is enough.
12. Secrets, refresh tokens, device credentials, and raw OAuth tokens must never be committed to the repository.

## MVP boundary

Implement only enough to prove:

- one cloud connector (`careerpack`);
- one local connector (`blender`);
- one public AI entry point;
- one device pairing flow;
- one policy/approval layer;
- one audit trail.

Do not build a marketplace, billing system, workflow engine, or hundreds of connectors before this works end-to-end.
