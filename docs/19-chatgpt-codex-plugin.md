# ChatGPT and Codex plugin

Connectors Gateway has one runtime and two packaging paths:

| Surface | Package / registration path |
| --- | --- |
| ChatGPT web / Work | Register `https://connect.rahmanef.com/mcp` in ChatGPT developer mode, then map the resulting `plugin_asdk_app...` technical ID through `plugin/.app.json`. |
| ChatGPT desktop / Codex | Install the repo marketplace at `.agents/plugins/marketplace.json`; it loads `plugin/.codex-plugin/plugin.json` and `plugin/.mcp.openai.json`. |
| Claude Code | Keep using `plugin/.claude-plugin/plugin.json` and `plugin/.mcp.json`. |

The OpenAI and Claude MCP config files are intentionally separate. Their JSON
shapes differ; sharing one file would make one host interpret the other host's
wrapper as a server name.

## What is already ready

- OAuth 2.1 authorization-code flow with S256 PKCE and dynamic client registration.
- RFC 9728 protected-resource discovery and RFC 8414 authorization-server discovery.
- Legacy initialize-based MCP revisions plus stateless MCP `2026-07-28`.
- Per-user dynamic tool catalogs; offline or unauthorized actions are not listed.
- ChatGPT tool metadata: `title`, focused descriptions, input and output schemas,
  OAuth security schemes, all four safety annotations, and invocation status text.
- Server-wide instructions in the first 512 characters.
- Static skill import through `skills/list`, `skills/get`, and `resources/read`,
  with SHA-256 resource digests.
- The same policy, approval, audit, execution, timeout, and redaction pipeline for
  old and new MCP transports.
- Safe MSO parity: 20 of MSO's 22 tools, including workflow lifecycle, trusted
  skill search, screenshots, bounded files, applications, and system health.
  `exec_run` and `browser_power` remain intentionally unavailable through this
  gateway because they expose full-host execution or live credential sessions.

## One required hosted-ChatGPT registration step

Do not commit a guessed or placeholder `.app.json`. The technical ID is created
by ChatGPT and is specific to the registered connection.

1. Enable ChatGPT developer mode.
2. Open the Plugins page and register `https://connect.rahmanef.com/mcp` with OAuth.
3. Copy the technical ID from the resulting browser URL. It starts with
   `plugin_asdk_app`.
4. Generate `plugin/.app.json` with that exact ID, then add
   `"apps": "./.app.json"` to `plugin/.codex-plugin/plugin.json`.
5. Refresh ChatGPT, install the plugin from the repo marketplace, run **Scan
   Tools**, review the imported skill, and test in a new chat.

The repository deliberately leaves step 4 incomplete until a real technical ID
exists. This prevents a package that looks complete but cannot resolve in
ChatGPT.

## Release order

Deploy the dashboard/Convex control plane before the gateway, then verify the
public OAuth discovery and token flow before registering the hosted ChatGPT app.
The exact sequence and compatibility rationale are documented in
[`docs/18-oauth.md`](./18-oauth.md#deployment-order).

## Acceptance checks in ChatGPT

1. OAuth redirects back to ChatGPT and the plugin becomes connected.
2. Read-only tools are distinguishable from write/destructive tools in the
   permissions UI.
3. Tool names and descriptions are understandable without opening the dashboard.
4. A write tool that needs gateway approval returns `APPROVAL_REQUIRED`; ChatGPT
   stops instead of retrying.
5. After approval in the dashboard, the user explicitly asks ChatGPT to run the
   action again.
6. `DEVICE_OFFLINE`, `POLICY_DENIED`, and validation failures are explained, not
   retried blindly.
7. The imported `connectors-gateway` skill is visible in the plugin draft.
8. Tools from accounts or devices belonging to another user never appear.

## Public submission gaps

Before a public directory submission, add reviewed privacy-policy and terms URLs,
listing assets, starter-prompt test cases, country availability, and policy
attestations. These are publication requirements, not MCP runtime behavior, and
must not be replaced with invented legal or brand assets.
