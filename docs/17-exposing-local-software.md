# Reaching software that runs on your own machine

The recurring question is "how do I put localhost on a public IP so an MCP client or
ChatGPT can read it". Usually the answer is that you do not, and this document says which
of three situations you are in.

## 1. The software runs on a machine where the Connectors Agent is installed

**You need no public IP, no port forward and no tunnel.** This is the case the whole
product exists for.

```text
AI client ──https──▶ Gateway ◀──outbound wss── Connectors Agent ──▶ 127.0.0.1 ──▶ Blender
```

The agent opens the connection *outwards*. From your router's point of view it is an
ordinary client talking to a website, so nothing has to be reachable from the internet
(`docs/01-architecture.md`, `AGENTS.md` invariants 1 and 2). Pair the machine on
`/devices`, and the connector appears to the AI as an ordinary tool call.

Blender is the shipped example, and its bridge is deliberately unreachable: the bind
address is the constant `HOST = "127.0.0.1"`, every request whose `Host` header is not
loopback is answered `403`, and the adapter refuses to call anything but loopback. Three
independent locks, described in `adapters/blender/bridge/README.md`, which states plainly:
**do not port-forward it, expose it through a tunnel, or "temporarily" change `HOST`.**

The bridge has no authentication of its own. Anything that can open a TCP connection to it
can drive Blender — on `0.0.0.0` that is everyone on the same Wi-Fi. Exposing it does not
just violate `AGENTS.md` invariant 3; it hands your machine to the network.

## 2. You have a local MCP server and want it as a *cloud* connector

Sometimes the software is not behind our agent — a self-hosted MCP server on a NAS, a
service on a VPS, an MCP server you wrote. Then it genuinely needs a public hostname,
because a cloud connector is a URL the gateway calls.

Give it one with a tunnel that terminates TLS and gives you a stable DNS name — Tailscale
Funnel or `cloudflared` are the usual two. Then connect it like any other remote MCP
server: paste the `https://…` URL on `/connections`.

Two things this does not exempt you from:

- **The gateway will not call a private address.** `convex/_shared/upstream_url.ts` rejects
  `10/8`, `172.16/12`, `192.168/16`, `127/8`, `169.254/16` (cloud metadata), their
  IPv4-mapped IPv6 forms, and any URL pointing back at this deployment. A tunnel is
  accepted because it gives you a *public* name; a LAN address is not, and that is not a
  bug to work around.
- **Your server is now on the internet and needs its own auth.** The gateway holds a
  credential and sends it, but it cannot make an unauthenticated server safe. If it accepts
  anonymous `tools/call`, publishing it means anyone can call it.

Give a tunnelled machine a **distinct connector id**. Never reuse `blender`, whose entire
contract is that it is loopback-only — a manifest claiming otherwise makes every safety
note in this repo false for that connector.

## 3. You want ChatGPT or Claude.ai to connect to *this gateway*

This is the reverse direction, and it is the one that does not work yet.

The gateway authenticates AI clients with a bearer API key (`cgk_…`). That is enough for
any host you configure with a file — **Claude Code, Claude Desktop, Cursor, mcp-remote**,
or your own agent — because those let you set an `Authorization` header.

**Consumer hosts do not.** ChatGPT's and Claude.ai's connector forms have no API-key field;
they will only attach to a server they can complete an OAuth flow against. So supporting
them means this gateway becomes an **OAuth 2.1 provider** — authorization endpoint, token
endpoint, PKCE, dynamic client registration, and the two discovery documents
(`/.well-known/oauth-protected-resource`, RFC 9728, and `/.well-known/oauth-authorization-server`,
RFC 8414).

Note that this is a *different job* from the OAuth **client** in `docs/16` step 2. That one
is us authenticating outwards to GitHub or Notion. This one is ChatGPT authenticating
inwards to us. Both are needed; neither exists today. The recipe for the provider half is
the `/chatgpt-mcp` skill, which exists precisely because several of these apps already
solved it — `models-rahmanef-com` runs full OAuth 2.1 PKCE with dynamic client
registration today.

## Summary

| What you have | What you do |
|---|---|
| Software on a machine you control, agent installed | Pair the device. No public IP. |
| A local MCP server, no agent | Tunnel it to a public hostname, connect it as a cloud connector with its own id and its own auth |
| Want ChatGPT / Claude.ai to use the gateway | Not yet possible — the gateway must become an OAuth provider first |
| Want Claude Code / Cursor / mcp-remote to use the gateway | Works today — issue an API key on `/setup` |
