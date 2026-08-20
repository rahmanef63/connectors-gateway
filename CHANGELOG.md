# Changelog

All notable changes to Connectors Gateway are documented here. The repository uses a
lockstep application/workspace version; connector manifest versions remain independent
contract versions and change only when their connector contract changes.

## [0.3.0] - 2026-08-20

### Added

- Added the verified **Content — Social Content OS** connector with OAuth discovery, content planning,
  captions, scheduling, metrics, social inbox, and approval-gated publishing/reply actions.
- Added the verified **rahmanef.com CMS** connector with OAuth-backed post, project, service, page,
  and media-management actions. Destructive delete operations remain R3 approval-gated.
- Production endpoint verification now covers four fixed connectors: CareerPack, Content, MSO, and
  rahmanef.com.

### Fixed

- Fixed the mobile **All screens** dialog using an explicit dynamic-viewport height instead of
  intrinsic dialog sizing, so it opens as a usable near-full-screen drawer on mobile while keeping
  the existing navigation and sign-out flow unchanged.
- Kept safe-area handling, scrollable drawer content, reduced-motion behavior, and the existing
  mobile dock interaction unchanged.

### Not included

- Open Silong is not shipped as a connector in this release because its current production MCP host
  fails normal TLS certificate verification. It can be added after the endpoint presents a valid
  public certificate.

### Validation

- 1,117 runtime tests and 724 web/Convex tests pass, including new catalog and mobile-drawer
  regressions.
- Four fixed production MCP/OAuth discovery chains pass credential-free endpoint verification.
- Production web build passes and the compiled mobile drawer measures 98.9% of the effective
  390×844 browser viewport in a headless geometry smoke test.

## [0.2.1] - 2026-08-20

### Fixed

- Fixed the immutable gateway release script so the semantic version is loaded before the
  Docker build and OCI version-label verification.
- Added semantic version + git revision OCI labels to both gateway and dashboard images.
- Added a dedicated immutable dashboard release script with revision/version verification.
- Added lockstep release checks covering workspace packages, Bun lockfile metadata, agent/runtime
  advertisements, and ChatGPT/Codex/Claude plugin manifests.

## [0.2.0] - 2026-08-20

### Added

- Multi-instance gateway serving with shared device-to-gateway relay ownership in Convex.
- Session-bound cross-instance dispatch routing for local device jobs.
- Shared transactional rate limiting for edge, OAuth, pairing start, and pairing claim traffic.
- Streamable HTTP remote-MCP initialization/session support and correlated SSE response parsing.
- Upstream circuit breaker diagnostics and operator-only diagnostics endpoint.
- Durable agent replay protection and signed gateway job-signing-key rotation.
- OAuth access-token renewal with encrypted refresh metadata and cross-instance refresh leases.
- Linux Secret Service device-credential storage with safe owner-only file fallback.
- Immutable git-SHA gateway/dashboard release images and revision verification.

### Security

- Cross-gateway peer requests are HMAC authenticated with timestamp/nonce replay bounds; the
  gateway service bearer is not sent over the peer network.
- Cross-instance job/result bodies are AES-GCM sealed and session-bound before delivery.
- Upstream non-global/reserved IP literals are rejected consistently at storage and runtime.
- OAuth scope downgrade, revoked/invalid provider grants, reconnect races, and duplicate
  historical connections fail closed or require reconnect as appropriate.
- Live device revocation closes active sessions and fails in-flight work with bounded delay.
- Approval rows are request-specific, single-use, expiring, and cleaned by bounded maintenance.

### Reliability and deployment

- Gateway production topology moved from a singleton lease to two active replicas with
  start-first rolling deployment after distributed relay routing was verified.
- Remote MCP retries remain limited to idempotent/read-only actions; ambiguous writes are never
  replayed automatically.
- Production endpoint discovery contracts for fixed connectors are verified in CI and daily.
- Gateway and dashboard releases are pinned to immutable `git-<sha>` images.
- Docker ownership/install path was optimized while preserving a non-root runtime.

### UI

- Dashboard shell received theme, depth, glass, spacing, focus, and motion polish without changing
  routes, permissions, consent steps, navigation structure, or user-flow semantics.
- Mobile dock and bottom sheet now account for safe areas, narrow phones, short screens, and
  responsive 3/4-column layouts.
- Motion respects `prefers-reduced-motion`.

### Validation

- Release validated with 1,115 runtime tests and 720 web/Convex tests, root/web typechecks,
  production builds, remote endpoint contracts, GitHub CI, two-replica cross-task routing smoke,
  public health checks, and desktop/mobile render smoke.

## [0.1.0] - 2026-08-15

### Added

- Initial production MVP with one gateway surface for remote/cloud and local/device connectors.
- CareerPack remote MCP connector, Blender local connector, Connectors Agent, device pairing,
  OAuth/PKCE, policy/approval enforcement, audit logging, dashboard, and self-hosted Convex control
  plane.
