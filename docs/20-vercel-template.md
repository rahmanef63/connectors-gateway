# Deploying this template on Vercel

This repository is a template. Clone it, set four environment variables, and you
have your own gateway: a dashboard, a control plane, and an MCP endpoint an AI
client can connect to.

This document is the *why*. The README is the *how*.

## The one thing to understand first

The repository holds three deployables, and only two of them can live on Vercel:

| Deployable    | What it is                                         | Vercel? |
| ------------- | -------------------------------------------------- | ------- |
| `apps/web`    | Dashboard **and** the gateway HTTP edge            | yes     |
| Convex        | Control plane — devices, connections, policy, audit | yes (Convex Cloud) |
| `apps/gateway`| The Bun edge **plus the device relay**              | no      |
| `apps/agent`  | Daemon on a user's own machine                      | n/a     |

A Vercel deployment serves **cloud connectors** — anything reachable over HTTPS.
It cannot serve **local connectors** (Blender, a local filesystem, anything on
someone's desktop), because those need a WebSocket held open for hours and a
serverless function is frozen between invocations. Deploy `apps/gateway`
somewhere that can hold a socket — Railway, Fly, Render, a VPS, Dokploy — when
you want those.

Nothing is lost by starting on Vercel. A local connector still appears in the
catalog, still resolves, and fails at execution with `DEVICE_OFFLINE`, which is
the truth: on that host, the user has no device online.

## One codebase, two hosts

`apps/web` does not reimplement the gateway. It **mounts** it.

```
apps/gateway/src/edge.ts        the host-agnostic surface
        │                       (Request → Response, WebCrypto, fetch)
        ├──────────────► apps/gateway/src/main.ts    Bun.serve + relay
        └──────────────► apps/web/lib/gateway/runtime.ts
                                 └── app/mcp/route.ts, app/oauth/**,
                                     app/v1/**, app/well-known/**
```

Every route file under `apps/web/app` that belongs to the gateway is three
lines: it calls `gatewayFetch`, and the gateway's own route table decides what
happens. There is one authentication path, one policy check, one audit write.
A host contributes exactly two things it alone knows — the caller's peer address
(for the rate-limit bucket) and whether it may own a WebSocket.

`main.ts` is the only module that touches a Bun global, and it is deliberately
not exported from the package, so importing the edge cannot drag Bun into a Next
build.

### The `.well-known` detour

Next's file-system router skips dot-prefixed segments, so `app/.well-known/…`
would never be served. The three OAuth discovery documents are dynamic — each
embeds this deployment's own origin — so a static file under `public/` is not an
option either. They live under `app/well-known/…` and are reached through
rewrites in `next.config.mjs`; the route file passes the canonical path back in,
because after a rewrite `request.url` carries the destination.

They must be served from the **gateway's own origin**, next to `/mcp`. An MCP
client's first probe goes to the host of the MCP URL and nowhere else — this is
the single most common reason a server that *has* OAuth reads to a client as a
server that does not.

## Four variables, not eleven

A gateway needs an AES key for credentials at rest, a service token Convex
recognises, and an Ed25519 keypair for signing jobs. Generating four independent
secrets and pasting them into a form before your first deploy is four chances to
paste the wrong thing, each failing at a different layer, hours apart.

So they are **derived**, not generated. `GATEWAY_SECRET` is the only one a human
handles; every process computes the rest from it with HKDF-SHA256 under distinct
labels (`packages/auth/src/derive.ts`). The Convex deployment and the Next.js
process agree on the service token because they each computed it — not because
anyone copied it twice.

```bash
bun run secrets -- --new     # mint one and show what it expands into
```

This is not one secret doing the work of four. Recovering a derived value tells
an attacker nothing about the others, but they share a root: `GATEWAY_SECRET` is
the compromise-everything secret, and rotating it re-keys the whole deployment at
once.

**The consequence you must accept before using it:** rotate `GATEWAY_SECRET` and
every stored connection credential becomes unopenable, because the key that
sealed them no longer exists. A deployment with real connections should set
`CREDENTIAL_ENCRYPTION_KEY` explicitly and keep it across rotations. Explicit
always beats derived, per variable — which is also the migration path for a
deployment that already has four independent secrets.

The fourth variable, `CONNECTORS_ENABLED`, is not a secret. It selects which of
the shipped manifests this deployment serves. `none` is an explicit empty
catalog; an id the build does not ship is a boot error rather than a connector
that silently vanished.

## What the build does, in order

`vercel.json` points at `scripts/vercel-build.mjs`, which runs:

1. **The gate** — `typecheck`, `typecheck:web`, `test`, `test:convex`. Vercel's
   build is the only CI a clone has. `next build` type-checks `apps/web` and
   nothing else, and has never run a test; without this gate, a dependency bump
   that reds the policy suite deploys green, and the first thing to notice is an
   AI client executing an action that should have been denied.
2. **The Convex environment** — `scripts/setup-convex-env.mjs` provisions the
   auth signing keys, `SITE_URL` and `GATEWAY_SERVICE_TOKEN`. It runs *after* the
   gate, so a red suite leaves the backend untouched.
3. **The deploy** — `convex deploy --cmd`, which pushes functions and schema and
   then builds Next with `NEXT_PUBLIC_CONVEX_URL` injected.

`GATE=off` exists for the one honest case — redeploying a commit you already
validated while an upstream is flaky — and says so loudly in the log.

### Preview deploys

A PR preview holding a **production** deploy key never runs `convex deploy`: the
script sees `VERCEL_ENV=preview` and builds the frontend only, so PR code cannot
overwrite your production backend. For a real isolated backend per PR, create a
**preview deploy key** (it starts with `preview:`) in the Convex dashboard and
set it as `CONVEX_DEPLOY_KEY` for Vercel's *Preview* environment only.

## Adding the device relay later

Nothing has to change in the Vercel deployment. Deploy `apps/gateway` with its
own `Dockerfile`, give it a hostname, and set on **both**:

```
GATEWAY_PUBLIC_URL   the gateway's own origin — it becomes the OAuth issuer
WEB_PUBLIC_URL       the dashboard's origin
GATEWAY_SECRET       the same value, so both derive the same keys
CONVEX_URL           the same Convex deployment
```

Then point `NEXT_PUBLIC_GATEWAY_URL` at the gateway host, so `/setup` hands users
the right MCP address, and give the agent `CG_GATEWAY_URL=wss://<gateway>/device`.

Note what does *not* change: no key is copied between the two hosts. They derive
the same key material from the same root.

## Limits of the Vercel deployment

Worth knowing before you rely on any of it.

- **No local connectors.** Explained above. This is architectural, not a bug.
- **Cold starts cost an Ed25519 import and a Convex client.** Both are cached per
  lambda instance, so it is the first request after a scale-up that pays.
- **The rate-limit key is a forwarding header.** It is used for the limiter
  bucket and nothing else — never for identity, never for a redirect URI, never
  in an authorization decision — but a determined caller can spread across
  addresses. The per-user and per-key budgets in Convex are the real ceiling.
- **A custom domain needs `GATEWAY_PUBLIC_URL` and `APP_ORIGIN` set.** The
  platform keeps reporting the `*.vercel.app` host, and a discovery document that
  names the wrong origin is one a client will correctly refuse.
- **The gate makes builds slow.** It runs the whole suite on every deploy. That
  is the trade: a clone has no other CI.
