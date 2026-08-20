# Connector strategy

Where connectors come from, which ones are worth having, and what each actually costs.
Researched 2026-08-15 with live probes; every endpoint below answered a real MCP
`initialize` or `tools/call` from this machine unless marked *unverified*.

## The structural fact everything rests on

`adapters/remote-mcp` is connector-agnostic. Its adapter does

```ts
callTool(baseUrl, token, tool, args, signal)   // baseUrl + token from the connections row
```

Nothing in it is connector-specific: the manifest supplies the action list, and each action
carries its own upstream tool name as `x-upstream`. So **a connector to any remote MCP server
is data, not code** — a manifest plus a per-user connection row.

That is the whole competitive position. Composio's moat is a catalog of ~1,100 toolkits.
Ours cannot be catalog size; it is that the generic path costs nothing per connector, and
that we can also reach software running on a machine nobody can address from the internet.

## What the MCP ecosystem did while we were building

The official `modelcontextprotocol/servers` repo is no longer where connectors live — it
holds seven reference servers, and its GitHub, Google Drive, Slack and Postgres servers are
archived. **The vendors took over.** Of 27 first-party endpoints probed, 26 answered, and
22 returned a spec-shaped `401` carrying an RFC 9728 `resource_metadata` pointer.

That last number is the important one: **a single generic OAuth 2.1 client with PRM
discovery authenticates against all 22 with no per-vendor code.** Auth is generic too, not
just transport.

## The Pareto set

Ranked by (breadth of real agent use) × (cheapness for us). Not by brand.

| # | Connector | Category | First-party MCP | Auth | Cost to us |
|---|---|---|---|---|---|
| 1 | GitHub | dev | yes | OAuth 2.1 (PRM) | row |
| 2 | Gmail | email | yes (preview) | OAuth 2.0, own client | row + Google client |
| 3 | Google Calendar | scheduling | yes (preview) | same client | row |
| 4 | Notion | docs / memory | yes | OAuth 2.1 (PRM) | row |
| 5 | Slack | chat | yes | OAuth 2.1 + workspace admin | row |
| 6 | Linear | issues | yes | OAuth 2.1 (PRM) | row |
| 7 | Google Drive | files | yes (preview) | same client | row |
| 8 | Atlassian | Jira + Confluence + JSM + Bitbucket + Compass | yes | OAuth 2.1 / API token | row + SSE transport |
| 9 | Stripe | payments | yes | OAuth 2.1 **or** restricted key | row |
| 10 | Supabase | database | yes | OAuth 2.1 (PRM) | row |
| 11 | Sentry | observability | yes | OAuth 2.1 (PRM) | row |
| 12 | Vercel | deploy | yes | OAuth 2.1 (PRM) | row |
| 13 | HubSpot | CRM | yes | OAuth 2.1 (PRM) | row |
| 14 | Google Sheets | tabular | yes (preview) | same client | row |
| 15 | Airtable | ops DB | yes | OAuth 2.1 (PRM) | row |
| 16 | Figma | design | yes | OAuth 2.1 (PRM) | row |

**Zero custom adapters.** Sixteen connectors cost three shared capabilities: the generic
remote-MCP path, an OAuth 2.1 client with PRM discovery and refresh, and one registered
Google OAuth client.

Deliberately out, because each overlaps something already in the set: Asana, monday,
Intercom, PayPal, Square, Box, Webflow, Close, Attio, Canva, Cloudflare, Neon, Netlify,
Prisma, Plaid. Out for cause: Salesforce / Zendesk / Shopify admin (no first-party admin
MCP endpoint found — *unverified*, do not ship on that basis); Microsoft 365 (preview,
Copilot licence, Entra admin registration); Discord / Telegram / WhatsApp / Twilio (no
first-party remote MCP — real custom adapters); Zapier and Rube (meta-aggregators —
pointing at them makes us a proxy for a competitor's proxy). **Composio was in that
last group and is now shipped — see "Composio, and the aggregator argument" below,
which is a reversal with reasons rather than a change of mind.**

Google is the outlier worth naming: its seven servers answer `initialize` unauthenticated
(Gmail 21 tools, Calendar 9, Drive 8, Sheets 6, Chat 4, Docs 2, Slides 2) but publish no
`/.well-known/oauth-protected-resource`, so they need our own registered client and a
per-product scope table. Highest value in the catalog, worst dependency profile — it is in
Workspace Developer Preview.

## Our own apps are the cheapest catalog we will ever get

Six already run a live MCP server. Probed 2026-08-15:

| App | Endpoint | Tools | Auth at rest | Note |
|---|---|---|---|---|
| CareerPack | `…convex.site/mcp` | ~69 | **plaintext** token | biggest surface; the plaintext storage is worth fixing on its own |
| open-silong | `coordinated-ptarmigan-140.convex.site/mcp` | 34 | sha256 | two deployments answer |
| rahmanef-com | `rahmanef.com/mcp` | 19 | sha256, 1-yr | best value/effort of the set |
| mso | `mso.rahmanef.com/mcp` | 17 | sha256, 90-day | 3-tier scope; `exec_run` is R4 — see below |
| models-rahmanef-com | `models.rahmanef.com/mcp` | ~20 | sha256 + full OAuth 2.1 PKCE | workspace-scoped bearer |
| codex (TemanUsaha) | `utmost-snake-682.convex.site/mcp` | 11 | sha256 | |

Without MCP: konglo-os, content-rahmanef-com, superspace. The `/chatgpt-mcp` skill exists
to add one. `tech-`, `design-` and `legacy-rahmanef-com` have MCP test files but their
domains 404 — dead, exclude.

**mso needs risk metadata before it is connected, not after.** Its `exec_run` is arbitrary
remote command execution — R4, which `AGENTS.md` invariant 7 disables by default. Connect
mso read-tier only: omit `exec_run` from the manifest entirely (absent beats disabled) and
mint its token with `OS_MCP_MAX_SCOPE=write`.

## Blender behind a public IP

Asked for, and it is a trap worth stating plainly: exposing the Blender bridge to the
internet contradicts `AGENTS.md` invariant 3 and the entire reason the device relay exists.
If a machine must be reachable as a *cloud* connector, put it behind Tailscale or a tunnel
and give it **a distinct connector id** — never by widening `blender`, whose whole contract
is that it is loopback-only.

## What this does NOT give us

A catalog is not a product. Composio also handles token refresh, per-tool schema drift,
rate limits and webhooks/triggers. Of those, only refresh is load-bearing for the sixteen
above — an OAuth connector whose token expires with no refresh is a connector that works
for an hour. Schema drift matters the moment a manifest is stored data rather than compiled
code: the upstream can rename a tool under a connector already in use.

## Composio, and the aggregator argument

Added 2026-08-16 at the owner's direction. The exclusion above says pointing at an
aggregator makes us "a proxy for a competitor's proxy", and that objection is still
correct — it is just not decisive, for one reason: **catalog breadth is the stated value
proposition and we cannot build 1,100 toolkits one manifest at a time.** Composio is a
bridge across that gap while the first-party sixteen are built properly. The distinction
from Zapier is what it is used *for*: a catalog source reached through the same generic
remote-MCP path as everything else, not a routing layer we hand control to.

Two things about it are genuinely different from every other connector here, and both are
costs, not details.

**It breaks per-action risk metadata, and that is invariant 8.** Every other connector
declares N actions with N risk classes. Composio declares one executing action —
`composio.tools.execute` — that reaches the entire catalog. One risk label now stands in
front of "send an email", "delete a repository" and "move money", which is exactly the
capability laundering the risk model exists to prevent. It is therefore shipped at **R3,
`destructive: true`**: `DEFAULT_RISK_DECISION` turns that into `REQUIRE_APPROVAL`, so no
Composio execution runs unattended. Do not "fix" that to R1 because the search tools next
to it are R0.

**Two of its tools are omitted, not disabled.** `COMPOSIO_REMOTE_BASH_TOOL` is arbitrary
shell and `COMPOSIO_REMOTE_WORKBENCH` is a remote execution surface — both R4, both denied
by default under AGENTS.md invariant 7. Following the `mso` precedent in this document,
absent beats disabled: an action that is not in the manifest cannot be enabled by a policy
edit, and cannot be reached by a caller who guesses its id.

Its shape differs from the others in two ways worth knowing before connecting one:

- **No `endpoint` in the manifest.** Composio issues a server per configuration —
  `https://backend.composio.dev/v3/mcp/<SERVER_ID>?user_id=<USER_ID>` — so the address is
  per-user and belongs in the connection row, the same as a self-hosted upstream.
- **`x-api-key`, not a bearer.** Which is why the credential header is now a manifest
  field; see below.

*Unverified:* the documented URL answered **307** to a probe with a placeholder server id,
and `mcp-client` refuses redirects on purpose — it will not replay a credential to a host
named by someone else. Whether a real server id answers directly or redirects is untested
here, and it is the first thing to check when connecting one for real.

## The credential header is a manifest field now

`mcp-client` hardcoded `Authorization: Bearer`. That made "a connector to any remote MCP
server is data, not code" true only for servers that agree with us about a header name —
and the first third-party connector did not. `auth.header` and `auth.scheme` are now part
of the contract, defaulting to `Authorization` / `Bearer ` so every existing connector is
unchanged. A non-Authorization header gets **no** prefix by default, because sending
`Bearer sk-…` to a server expecting `sk-…` fails as an authentication error rather than as
a configuration one.

The header name is pattern-bounded in the manifest schema and re-checked at the call, since
manifests become user-authored rows at step 1 — a header name is otherwise a place to smuggle
a second header.

Adding Composio also found a test that had quietly encoded a wrong assumption: every
`x-upstream` name was asserted to be lowercase `snake_case`, which is *our* naming rule for
servers we write, not a rule third parties follow. Composio ships `COMPOSIO_SEARCH_TOOLS`.
A gateway that rejects a remote tool for being spelled differently is a gateway that can
only talk to itself.

## The three decisions (owner, 2026-08-15)

The sequencing below is not a default — it follows from three answers only the owner could
give. Written down because every one of them can be re-opened, and because the previous
draft of this section assumed the opposite of all three.

1. **Other people will hold accounts within 90 days.** So this is multi-tenant, and the
   single-owner shortcut — manifests as files on the VPS, tokens pasted by hand — is not the
   finish line. Connectors must become data, with per-owner scoping.
2. **The local-device relay is a feature, not the product.** Catalog breadth is the value
   proposition. The relay stays at "it round-tripped once"; Blender and a second local
   adapter are parked.
3. **The gateway holds the upstream credential** (the Composio model), not the caller. Users
   click connect and never see a token. That makes all sixteen connectors reachable — and it
   makes us responsible for refresh, revocation propagation, key rotation, and a breach that
   would expose every user's mailbox at once.

Decision 3 is what makes the OAuth client mandatory rather than optional: twelve of the
sixteen accept nothing else, and decision 1 means we cannot fall back on "the owner pastes a
bearer".

## Sequencing

The set above is a **cost model, not a work order**. `AGENTS.md` still puts "dozens of SaaS
connectors" outside the MVP boundary — the catalog is the destination, not the next commit.

Done:

- **The front door.** Issue an API key, create a connection, correct the CareerPack contract.
- **One real call, end to end.** Proven against the live gateway: key → policy → sealed token
  decrypted → real HTTPS call → upstream 401 (placeholder token) → `UPSTREAM_ERROR` → one
  audit row. Every link fired; only a real upstream token is missing.

Done since:

- **Collapsed `adapters/careerpack` into the generic `adapters/remote-mcp` type.** Mostly
  deletion: the package, its bespoke adapter and its `UPSTREAM_TOOL` map are gone. A remote
  MCP server is now a manifest in `adapters/remote-mcp/connectors/` whose actions each carry
  an `x-upstream` name, executed by one generic adapter. Adding a connector is a JSON file
  plus one line in `connectors.ts` — no package, no adapter, no gateway change.

- **The OAuth 2.1 client** (`700656e`). PRM discovery (RFC 9728) → authorization-server
  metadata (RFC 8414) → PKCE S256 → dynamic client registration (RFC 7591) where the server
  offers it → code exchange, with `resource` (RFC 8707) on both legs. Connecting now asks for
  at most a client id and secret, and for a DCR-capable server for nothing. Every endpoint it
  learns from a third party's metadata goes through the SSRF gate before it is called.
  Upstream refresh is now implemented: expiry and one encrypted renewal document are
  stored per connection, and a generation-checked Convex lease coordinates refresh-token or
  client-credentials renewal across gateway instances. Provider secrets remain ciphertext in
  Convex and are opened only by the lease holder immediately before the token POST.

  Proving it against Linear or Notion first was the plan; discovery was proven against the
  live CareerPack server instead. That found a bug on THIS side, not theirs: the manifest
  named CareerPack's **dev** Convex deployment, which has no `APP_URL` and so advertises
  `https://careerpack.local/oauth/authorize`. Production was always correct. Fixed
  endpoints now carry a reviewed `verification` block, and a credential-free live verifier
  pins the MCP resource, authorization server, browser endpoint, token endpoint and DCR
  endpoint. Relevant pull requests, `main`, and a daily schedule run the same check.

- **Composio, plus a manifest-declared credential header.** Two shipped connectors now, one
  of them third-party, which is what actually proved the "connectors are data" claim — and
  found the two places it was not yet true. Read the section above before raising its risk
  class.

- **The short path: `client_credentials`.** Where a server advertises that grant, an id and
  a secret are the whole connection: one POST, no consent screen, nothing held between
  requests. CareerPack offers it, so connecting it is two fields and a button. Only sent
  when the server advertises the grant — RFC 8414 §2's default is `authorization_code`, so
  silence never gets a secret.

Next, in order:

0. ~~**The web test suite is not gated.**~~ **Closed 2026-08-20.** `bun run validate`
   now runs root typecheck/tests and the complete `apps/web` Vitest/Convex suite. The pre-push
   hook therefore cannot report a green validation while skipping the control plane and UI.

1. **Composio needs a real key against a real server.** Fixed production endpoints are now
   machine-verified, but Composio is intentionally per-user and cannot be probed without a real
   server URL plus key. Everything below is untested against Composio specifically: the
   manifest, the `x-api-key` path and the BYOK form are all written
   and none has met a live Composio server. Its documented URL answered 307 to a probe and
   `mcp-client` refuses redirects on purpose, so that is the first thing to find out.

2. **Connectors as data** — a `connectors` table, per-owner CRUD, and discovery that calls
   the upstream's `tools/list` so a user picks which tools to expose. Decision 1 requires it.
   `adapters/remote-mcp/src/connectors.ts` is the file-backed stand-in for that table, and
   validates every manifest at the boundary precisely so the rows can replace the files.
   `executor` must be `v.literal("cloud")`: a user-declared *local* manifest could only alias
   an action a compiled agent adapter already implements, so its one reachable use is
   relabelling an R3 local action as R1 to skip the approval gate.
3. ~~**Approval persistence.**~~ **Done 2026-08-16.** An `approvals` row is keyed by a
   `requestHash` over connector + action + canonicalised input, so approving "delete issue 5"
   cannot be replayed as "delete issue 500" — an approval keyed on the action alone would have
   been a standing grant wearing a confirmation screen's clothes. Claiming is a *mutation*, not
   a query: "is it approved?" and "mark it used" in two steps lets two concurrent calls ride one
   human decision. Rows are single-use and expire in ten minutes.

   Three deliberate refusals, each of which would otherwise have made the screen decorative:
   a re-request never revives a denial, a failed queue write still refuses the call, and a
   gateway with no approval store configured refuses rather than allows — absence of a control
   plane must not read as permission.
4. **The catalog.** Rows, not sprints.

### What multi-tenancy makes urgent that was previously ignorable

- **`redact()` runs on error paths, not on success output.** While there is one tenant, a
  hostile connector's output is self-harm. The moment one person's connector output can
  reach another person's session, it is a prompt-injection channel. Fix before step 2.
- **Key custody.** `CREDENTIAL_ENCRYPTION_KEY` is one env var on one box protecting every
  user's upstream tokens. It needs a rotation story before the second tenant, not after.
- **`ownerType: "workspace"`** is currently unreachable in every store path. Either implement
  it deliberately or narrow the type — a half-implemented sharing axis is how cross-tenant
  reads happen.
- ~~**Audit rows carry no `connectionId`.**~~ Closed 2026-08-20. Cloud and local executors
  return audit-only connection/device attribution; the pipeline persists it and strips both
  identifiers from the public REST/MCP result through an explicit allowlist.
