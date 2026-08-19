# Deployment

## Cloud components

MVP deployment needs:

- public web/dashboard;
- public gateway endpoint;
- auth;
- database;
- encrypted credential storage;
- device relay;
- optional object storage for files/results;
- logs/metrics.

## DNS example

```text
app.example.com       dashboard
connect.example.com   gateway + MCP
```

The relay can initially share the gateway origin:

```text
wss://connect.example.com/device
```

## Local components

User installs:

```text
Connectors Agent
```

The agent communicates outbound to the relay and loopback to local applications.

## No public IP requirement

Do not ask users to:

- configure router port forwarding;
- expose `9876`;
- buy a static IP;
- open Windows Firewall inbound to the internet;
- run Blender itself on a public host.

## Live deployment

Three deployables, one repo, one Dokploy project (`connectors-gateway`).

| What                              | Domain                                            | Dokploy service                      | Build                     |
| --------------------------------- | ------------------------------------------------- | ------------------------------------ | ------------------------- |
| Dashboard (Next)                  | `connectors.rahmanef.com`                         | application **`connectors-gateway`** | root `Dockerfile`         |
| Gateway (Bun, MCP + REST + relay) | `connect.rahmanef.com`                            | application **`connect-gateway`**    | `apps/gateway/Dockerfile` |
| Convex control plane              | `api-` / `site-` / `dash-connectors.rahmanef.com` | compose **`connectors-gateway-db`**  | `docker-compose.yml`      |

**The application names are the trap.** `connectors-gateway` is the _dashboard_;
the gateway is `connect-gateway`. Match on the domain, not the service name.

### Three things that only failed in a real deploy

1. **`bun install --linker=hoisted` in the dashboard image is load-bearing.** Bun's
   default isolated linker stores packages under `node_modules/.bun/<pkg>@<ver>/`
   behind symlinks; Next's standalone tracer does not follow that into transitive
   dependencies. The image builds clean and then crash-loops on a missing
   `@swc/helpers`.
2. **Convex module paths cannot contain hyphens.** Every file under `convex/` is
   `snake_case` for that reason — see `apps/web/convex/README.md`.
3. **The gateway application needs `dockerContextPath: "/"`.** With it unset,
   Dokploy uses the Dockerfile's own directory as the build context, so `COPY . .`
   copies only `apps/gateway` and every `@cg/*` workspace dependency fails to
   resolve.

Two non-problems that look alarming in the logs: the Hostinger DNS step fails with
`"A" record content must be a valid IPv4 address` because the API resolves the host
to IPv6 — the `*.rahmanef.com` wildcard already covers every subdomain. And
`convex deploy` prints `self-signed certificate` next to real errors; it is noise.

### Redeploying

`git push` is the whole procedure. Dokploy auto-deploys both applications, and the
pre-push hook deploys Convex first whenever the push touches `convex/`. Do not run
the Convex CLI by hand.

The one-off bootstrap, if the stack is ever rebuilt from nothing:

```bash
# 1. project + Convex compose + dashboard application + DNS
node <si-coder>/scripts/deploy.js \
  --project connectors-gateway --app connectors-gateway \
  --domain connectors.rahmanef.com
# the app name must equal the GitHub repo name — the script derives the repo from it

# 2. admin key, then push the Convex functions
docker exec <compose>-backend-1 ./generate_admin_key.sh
CONVEX_SELF_HOSTED_URL=https://api-connectors.rahmanef.com \
CONVEX_SELF_HOSTED_ADMIN_KEY=<key> bunx convex deploy --yes

# 3. Convex environment: JWT_PRIVATE_KEY, JWKS, GATEWAY_SERVICE_TOKEN, ADMIN_EMAILS
#    (via the admin REST endpoint — `convex env set` mangles a leading ----- PEM)

# 4. the gateway application (second app, not modelled by deploy.js)
```

## Dashboard environment

Two runtime variables the dashboard needs beyond `NEXT_PUBLIC_CONVEX_URL`. Both are
server-only — never `NEXT_PUBLIC_` — and neither is a build argument.

| Variable                    | Why                                                                                                                                                                                                                                                                                                            |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CREDENTIAL_ENCRYPTION_KEY` | The same base64 32-byte key the gateway holds. The connect flow seals a credential here, because the OAuth token arrives on a redirect this process handles. Convex is never given it. Unset, connecting fails with a message naming the variable rather than storing a credential the gateway could not open. |
| `APP_ORIGIN`                | This deployment's public origin, e.g. `https://connectors.rahmanef.com`. The OAuth redirect URI is built from it. Deliberately NOT derived from the `Host` header: a redirect URI taken from a header the client controls is how an authorization code ends up delivered somewhere else.                       |

## Google dashboard login

Google is a Convex Auth provider, so its credentials live in the **Convex
runtime**, not in the dashboard application and not in the public gateway.
Create a Google OAuth **Web application** with this exact production callback:

```text
https://site-connectors.rahmanef.com/api/auth/callback/google
```

Set these as Convex environment variables through the same protected admin path
used for the other Convex secrets:

```text
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
```

Do not copy either value into `NEXT_PUBLIC_*`, Dokploy build arguments, browser
storage, repository files or tool output. The provider requests identity only;
it does not request offline Google API access.

Password remains available for existing users. Google intentionally disables
implicit email account linking because password sign-up does not verify email.
A Google identity and a pre-existing password identity with the same email stay
separate until an explicit, already-authenticated linking flow exists.

## Scaling boundary

A persistent relay is stateful by connection presence, but job metadata and device ownership should live in shared storage so multiple relay instances can coexist later.

Do not optimize for global scale before MVP correctness and security.
