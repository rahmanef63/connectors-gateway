# Connector strategy

Where connectors come from, which ones are worth having, and what each actually costs.
Researched 2026-08-15 with live probes; every endpoint below answered a real MCP
`initialize` or `tools/call` from this machine unless marked *unverified*.

## The structural fact everything rests on

`adapters/careerpack` is already connector-agnostic. Its adapter does

```ts
callTool(baseUrl, token, tool, args, signal)   // baseUrl + token from the connections row
```

The only connector-specific things in the package are the manifest's action list and the
`UPSTREAM_TOOL` name map. So **a connector to any remote MCP server is data, not code** —
a manifest plus a per-user connection row.

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
pointing at them makes us a proxy for a competitor's proxy).

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

## Sequencing

The set above is a **cost model, not a work order**. `AGENTS.md` puts "dozens of SaaS
connectors" outside the MVP boundary, and the core loop is still unproven. The order that
respects both:

1. The front door — issue an API key, create a connection, correct the CareerPack contract.
   Nothing else is reachable without it.
2. One real call, end to end, against CareerPack.
3. Pair one device and round-trip one Blender job — the thing Composio cannot do.
4. Collapse `adapters/careerpack` into a generic `remote-mcp` type; connectors become files.
5. Operator-supplied manifests from disk + an egress allowlist. **For a single-owner
   product this is plausibly the finish line.**
6. Approval persistence, before any connector with a destructive action.
7. The OAuth 2.1 client. One feature, twelve connectors — and the largest single piece of
   engineering here, which is exactly why it is not first.

Steps 1–5 need no new tables, no OAuth and no UI beyond two forms. Step 7 is where the
catalog above becomes real.
