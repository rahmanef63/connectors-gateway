# Blender bridge add-on

The Blender half of the `blender` connector. It exposes eight fixed JSON endpoints plus
`/health` on `127.0.0.1`, and nothing else.

```text
Gateway ──outbound session──▶ Connectors Agent ──▶ Blender adapter ──▶ 127.0.0.1:8787 ──▶ Blender
```

## Files

```text
connectors_bridge.py   the add-on: HTTP server, main-thread dispatch, register/unregister
handlers.py            one function per action, all pure bpy with validated arguments
__init__.py            bl_info + the shim that makes the folder installable as-is
```

## Install

1. Copy this whole `bridge/` folder into Blender's add-ons directory, renamed
   `connectors_bridge`:
   - Linux: `~/.config/blender/<version>/scripts/addons/connectors_bridge/`
   - macOS: `~/Library/Application Support/Blender/<version>/scripts/addons/connectors_bridge/`
   - Windows: `%APPDATA%\Blender Foundation\Blender\<version>\scripts\addons\connectors_bridge\`
2. Restart Blender.
3. `Edit > Preferences > Add-ons`, search "Connectors Gateway Bridge", tick it.

## Port

Default `8787`. Change it in the add-on preferences, or set `CG_BLENDER_BRIDGE_PORT`
(1024-65535) before starting Blender. Re-enable the add-on after changing it — the socket
is opened in `register()`.

The agent must be pointed at the same port:

```ts
createBlenderAdapter({ bridgeUrl: "http://127.0.0.1:8787" })
```

## Why the port stays on loopback

The bind address is the constant `HOST = "127.0.0.1"` in `connectors_bridge.py`. It is not
a preference, not an environment variable, and there is no code path that passes anything
else to `ThreadingHTTPServer`.

- The product promise is remote access to local software **without turning the machine
  into a public server** (`docs/03-security-model.md`). Reachability comes from the agent's
  *outbound* session to the gateway, never from an inbound port.
- The bridge has no authentication of its own. Anything that can open a TCP connection to
  it can drive Blender. On `0.0.0.0` that is everyone on the coffee-shop Wi-Fi; on
  `127.0.0.1` it is processes already running as that user.
- `docs/14-threat-model.md`, first threat: "attacker reaches local Blender port" —
  mitigated by binding to loopback and keeping the agent as the only network mediator.
- `AGENTS.md` invariant 3 states it as a non-negotiable.

Two independent locks enforce it: the socket is bound to loopback, and every request whose
`Host` header is not `127.0.0.1` / `localhost` / `::1` is answered `403` (that second check
is what stops DNS-rebinding from a browser tab). The adapter refuses to *call* anything but
loopback as well, so all three layers agree.

**Do not** port-forward this, expose it through a tunnel, or "temporarily" change `HOST`.

## What the bridge will not do

There is no endpoint that runs Python, runs a shell command, or reads an arbitrary path.
Those capabilities do not exist in the route table — absent rather than disabled
(`AGENTS.md` invariant 7). Requests are dispatched through the fixed `ROUTES` dict in
`handlers.py`; an unlisted path is a `404` before any argument is even parsed.

Files are written only under:

```text
<system temp>/connectors-gateway/blender-exports/
```

`_export_target()` rejects absolute paths, `..`, `~`, drive letters and null bytes, then
re-resolves with `realpath` and proves the result is still inside that root — the same
check the adapter already performed, repeated because the bridge trusts nobody.

## Threading

`bpy` is not thread-safe. The HTTP server runs on its own thread and pushes each call onto
a queue; a `bpy.app.timers` callback drains it on Blender's main thread and hands the
result back. A request blocks until the main thread answers, and gives up after 300s.
While a modal operator is running Blender does not service timers, so calls will simply
wait — that is expected.

## Responses

Every response is a JSON object. File-producing actions return a base name, MIME type and
size, never a path:

```json
{ "name": "render_0001.png", "mimeType": "image/png", "sizeBytes": 20481, "renderedFrame": 1, "durationMs": 932 }
```

Errors are `{"error": "..."}` with a status of 400 (bad argument), 403 (non-loopback Host),
404 (unknown endpoint), 500 or 504. Blender's own exception text is never forwarded — it
can embed local paths.
