# Ship checklist

`AGENTS.md` says *how* to build here. This says *what must be true* before you
point a real AI client at a real account.

A ticked box names the file that keeps it true, so you can check the claim
rather than trust it. An unticked box is work only you can do — the template
cannot make these decisions for your deployment.

## Before the first deploy

- [x] The build gates on types and both test suites before touching Convex — `scripts/vercel-build.mjs`
- [x] A PR preview with a production deploy key never deploys the backend — `scripts/vercel-build.mjs`
- [x] Auth signing keys are provisioned once and never regenerated on redeploy — `scripts/setup-convex-env.mjs`
- [x] The gateway and Convex agree on the service token without it being copied — `packages/auth/src/derive.ts`
- [ ] `GATEWAY_SECRET` is stored somewhere you can still read it in a year. It is the compromise-everything secret and the only one you hold.
- [ ] `CONNECTORS_ENABLED` names only connectors you actually intend to serve.

## Before anyone else can sign up

- [ ] **`ADMIN_EMAILS` is set on the Convex deployment.** Sign-up is open. Without this there is no administrative ceiling above whoever registers next: `bunx convex env set ADMIN_EMAILS "you@example.com"`
- [ ] You have signed in once yourself, so your account exists before strangers' do.
- [ ] A custom domain, if you use one, is reflected in `GATEWAY_PUBLIC_URL` and `APP_ORIGIN`. The platform keeps reporting the `*.vercel.app` host, and a discovery document naming the wrong origin is one a client will correctly refuse.

## Security

- [x] Every action is authorized per call, not once at connect time — `packages/policy`, `apps/gateway/src/pipeline/execute.ts`
- [x] Connector credentials never appear in tool output — `packages/observability/src/redact.ts`
- [x] Credentials are sealed with AES-256-GCM; Convex stores ciphertext it cannot open — `packages/auth/src/secret-box.ts`
- [x] Identity-shaped arguments from the AI never reach an adapter — `apps/gateway/src/pipeline/identity.ts`
- [x] Rate budgets are transactional in Convex, so they survive scaling — `apps/gateway/src/http/distributed-rate-limit.ts`
- [x] OAuth discovery documents embed configured origins, never the `Host` header — `apps/gateway/src/http/handlers/well-known.ts`
- [x] The device relay is refused on a host that cannot hold a socket, rather than registering a route that will not answer — `apps/gateway/src/app.ts`
- [ ] **Every action's `risk` is classified honestly.** R2+ enters the approval path; an under-classified destructive action is one an AI can take unattended. This is the review that matters most in a new connector.
- [ ] **No Content-Security-Policy.** It needs per-request nonces, so it belongs to your deployment, not the template.
- [ ] Rate limiting per IP happens in front of the app (your CDN/WAF) if you need it. The forwarded address is used for the limiter bucket only — never for identity, never for a redirect URI, never in an authorization decision.

## Data

- [x] A missing row and someone else's row are indistinguishable to a caller — `apps/web/convex/_shared/auth.ts`
- [x] Reads are bounded — `.take(MAX_*)`, never `.collect()` on a growing table
- [x] Approval consent binds to one exact call, is spent once, and expires — `apps/web/convex/service/approvals.ts`
- [ ] You have looked at the audit log after your first real call and recognised what it recorded.

## Connectors

- [ ] Each action's `description` is written for the model that will read it: what the fields mean, which ones to ask the user about rather than infer, what the defaults are.
- [ ] Each `inputSchema` sets `"additionalProperties": false`.
- [ ] `bun run verify:remote-endpoints` passes against the endpoints your manifests declare.
- [ ] You have called one **read** action from a real AI client before trusting any write.

## Operations

- [x] Server errors log one JSON line; headers, cookies and query strings are never logged — `packages/observability`
- [x] Job-signing key rotation has an overlap window, so agents migrate instead of re-pairing — `docs/12-deployment.md`
- [ ] You know how to roll back: Vercel keeps previous deployments, Convex keeps previous function versions.
- [ ] If you serve local connectors, the Bun gateway is deployed somewhere that can hold a WebSocket open, and you have paired one device end to end.

## Known limits

Not bugs to file — the edges of what this claims.

- **A Vercel deployment cannot serve local connectors.** Architectural: a serverless function is frozen between invocations, so it cannot own a device socket. `docs/20-vercel-template.md`.
- **Rotating `GATEWAY_SECRET` makes stored credentials unopenable.** The key that sealed them is derived from it. Pin `CREDENTIAL_ENCRYPTION_KEY` before you have connections worth keeping.
- **The build gate makes every deploy slow.** It runs the whole suite. That is the trade for a clone having no other CI.
- **Hosted ChatGPT registration is still pending.** The runtime and the plugin package are tested; ChatGPT must issue a real technical ID before an end-to-end web round trip can be claimed.
