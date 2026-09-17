# Connectors Gateway

**One gateway between your AI clients and everything they should be allowed to
touch.** Cloud APIs and software on your own machine, behind one normalized
connector contract, one policy layer, and one audit trail.

Clone it, set four variables, deploy. **Current release: v0.4.0** · see
[`CHANGELOG.md`](./CHANGELOG.md).

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Frahmanef63%2Fconnectors-gateway&project-name=connectors-gateway&repository-name=connectors-gateway&env=NEXT_PUBLIC_CONVEX_URL,CONVEX_DEPLOY_KEY,GATEWAY_SECRET,CONNECTORS_ENABLED&envDefaults=%7B%22CONNECTORS_ENABLED%22%3A%22example%22%7D&envDescription=Four%20values%3A%20your%20Convex%20URL%20and%20deploy%20key%2C%20one%20root%20secret%20(openssl%20rand%20-base64%2048)%2C%20and%20which%20connectors%20to%20serve.&envLink=https%3A%2F%2Fgithub.com%2Frahmanef63%2Fconnectors-gateway%2Fblob%2Fmain%2Fdocs%2F20-vercel-template.md)

---

## What you get

An AI client should not need to know whether an action runs over REST, OAuth,
MCP, a WebSocket, a local socket, or an application SDK.

```mermaid
flowchart LR
    AI["ChatGPT / Claude / Cursor / Agent"] --> GW["Connectors Gateway"]
    GW --> CR["Connector Registry"]
    CR --> CE["Cloud Executor"]
    CR --> LE["Local Executor"]
    CE --> SaaS["Your APIs / SaaS / any MCP server"]
    LE --> RELAY["Secure Device Relay"]
    RELAY --> AGENT["Connectors Agent"]
    AGENT --> LOCAL["Blender / Unreal / filesystem / local apps"]
```

One public HTTPS surface. Local machines never expose a public IP or an inbound
port — the agent dials **out**.

**Core invariant:** public AI clients talk only to the gateway; local software
talks only to the local agent; the agent opens the connection outward.

## Deploy it

### The four variables

| Variable                 | What it is                                                        |
| ------------------------ | ----------------------------------------------------------------- |
| `NEXT_PUBLIC_CONVEX_URL` | Your `*.convex.cloud` address                                     |
| `CONVEX_DEPLOY_KEY`      | Convex production deploy key, with env read + write               |
| `GATEWAY_SECRET`         | `openssl rand -base64 48` — every other key is derived from it    |
| `CONNECTORS_ENABLED`     | Which shipped connectors to serve. `example` to start             |

That is the whole list. The AES key for credentials at rest, the Convex service
token and the Ed25519 job-signing keypair are **derived** from `GATEWAY_SECRET`
with HKDF — the Convex deployment and the Next.js process agree on them because
they each computed them, not because you copied anything twice.

```bash
bun run secrets -- --new     # mint a root secret, see what it expands into
```

Rotating `GATEWAY_SECRET` re-keys everything at once, including the key that
sealed your stored connection credentials. Once you have live connections, pin
`CREDENTIAL_ENCRYPTION_KEY` explicitly and keep it — explicit beats derived, per
variable.

### The steps

1. **Deploy the button above**, or push your clone and import it into Vercel.
   `vercel.json` already sets the build; leave the root directory alone.
2. **Create a Convex project** and paste its URL and a production deploy key.
   The key needs `deployment:deploy` + `deployment:env:view` +
   `deployment:env:write`, because the build provisions the Convex side for you.
3. **Deploy.** The build gates on types and both test suites *before* it touches
   Convex, then pushes functions and schema, then builds the dashboard.
4. **Sign up** on your new deployment, then set an admin ceiling:
   `bunx convex env set ADMIN_EMAILS "you@example.com"`.
5. **Connect a client.** `/setup` shows the MCP address and mints an API key.

Every push to your production branch redeploys Convex and the frontend together.

[`docs/20-vercel-template.md`](./docs/20-vercel-template.md) explains what the
build actually does and why the secrets are derived.

### What runs where

| Deployable     | What it is                                          | Vercel? |
| -------------- | --------------------------------------------------- | ------- |
| `apps/web`     | Dashboard **and** the gateway HTTP edge             | yes     |
| Convex         | Control plane: devices, connections, policy, audit  | yes     |
| `apps/gateway` | Bun edge **plus the device relay**                  | no      |
| `apps/agent`   | Daemon on a user's own machine                      | n/a     |

A Vercel deployment serves **cloud connectors**. **Local** connectors (Blender, a
local filesystem) need a WebSocket held open for hours, which a serverless
function cannot do — deploy `apps/gateway` on Railway, Fly, Render, a VPS or
Dokploy when you want those. Nothing changes in the Vercel deployment when you
do; both hosts derive the same keys from the same `GATEWAY_SECRET`.

`apps/web` does not reimplement the gateway, it **mounts** it: each gateway route
file is three lines calling into `apps/gateway/src/edge.ts`. One authentication
path, one policy check, one audit write, two hosts.

## Add your own connector

A remote-MCP connector is **one JSON file and one import line**. No package, no
adapter, no code.

```bash
cp adapters/remote-mcp/connectors/example.connector.json \
   adapters/remote-mcp/connectors/acme.connector.json
# edit it, add one import in adapters/remote-mcp/src/connectors.ts,
# then set CONNECTORS_ENABLED=acme
```

[`docs/21-add-a-connector.md`](./docs/21-add-a-connector.md) walks through it —
including the part that actually matters, which is that an action's
`description` is a prompt read by a model and its `risk` decides what needs a
human.

Shipped as reference: `example` (annotated starting point), `careerpack`
(bearer), `composio` (API key), `content` and `mso` (OAuth 2.1 with
dynamic registration), and `blender` (local, through the agent). Shipping and
serving are separate, so you can leave them in the tree and serve none of them.

## Connecting an AI client

Authorization is **OAuth 2.1 + PKCE with open dynamic registration** — there is no
key to paste. A client with no token gets a 401 carrying a `resource_metadata`
pointer, walks the two `/.well-known` documents, registers itself, sends the user
through the consent screen, and exchanges the code for a token.
[`docs/18-oauth.md`](./docs/18-oauth.md). `plugin/` packages the same endpoint for
ChatGPT, Codex and Claude —
[`docs/19-chatgpt-codex-plugin.md`](./docs/19-chatgpt-codex-plugin.md).

## Local development

```bash
bun install
cp .env.example .env          # then set GATEWAY_SECRET
bunx convex dev               # terminal 1 — links a deployment, writes the URL

bun run dev:web               # dashboard + mounted gateway → localhost:3000
bun run dev:gateway           # optional: the Bun edge + relay → localhost:8787
bun run dev:agent             # optional: local agent (pair it first)
```

```bash
bun run validate                  # typecheck + both test suites
bun run verify:remote-endpoints   # credential-free live OAuth discovery check
bun run secrets                   # what your GATEWAY_SECRET expands into
```

The package manager is **bun**. `bun.lock` is the committed lockfile.

## Repository layout

```text
apps/       web (dashboard + mounted gateway) · gateway (Bun edge + relay) · agent (local daemon)
packages/   core · registry · protocol · auth · policy · executor · schemas · sdk · observability
adapters/   remote-mcp (cloud, manifest-driven) · blender (local, via the agent)
plugin/     universal ChatGPT/Codex package plus a Claude compatibility package
docs/       architecture, security model, connector contract, deployment, roadmap
```

`git ls-files` is the map. Nothing here is generated, so nothing here can rot.

## Stack

| Layer             | Choice                                   | Why                                                                                    |
| ----------------- | ---------------------------------------- | -------------------------------------------------------------------------------------- |
| Workspace         | Bun 1.3 workspaces                       | packages ship TypeScript source, so there is no build step to keep in sync              |
| Gateway edge      | Web `Request`/`Response`, WebCrypto      | the same code serves under `Bun.serve` and under Next.js on Vercel                      |
| Relay             | one Bun process holding the WebSockets   | job dispatch is an in-process call, not a second hop                                     |
| Local agent       | Bun **or** Node 22                       | it runs on a user's machine — global `fetch`/`WebSocket` only, no runtime lock-in       |
| Control plane     | Convex                                   | devices, pairing, connections, policy, audit                                             |
| Dashboard         | Next.js 16 App Router + React 19 + Tailwind v4 | `proxy.ts`, not `middleware.ts`                                                    |
| Job signing       | Ed25519 (WebCrypto)                      | agents verify with a public key; no shared secret ever lands on a user's machine        |
| Credential hashing| PBKDF2-SHA256 (WebCrypto)                | one implementation that runs in Bun, Node and the Convex runtime                        |
| Key derivation    | HKDF-SHA256 (WebCrypto)                  | four keys from one root secret, so a clone sets one                                      |

One runtime dependency outside the framework layer: `ajv`, for JSON Schema
validation.

## Status and reading order

Phases 0–4 are implemented and unit-tested; the cloud path is proven against a
live stack. [`docs/13-mvp-roadmap.md`](./docs/13-mvp-roadmap.md) tracks what is
done, what is partial, and what is proven.

Before changing anything, read [`AGENTS.md`](./AGENTS.md) — the non-negotiable
invariants — and [`CHECKLIST.md`](./CHECKLIST.md), which is what must be true
before you point a real AI client at a real account.

This repository is intentionally separate from
[`rahmanef63/connectors`](https://github.com/rahmanef63/connectors): that one is
the cookbook and SSOT; this one is the runtime.
