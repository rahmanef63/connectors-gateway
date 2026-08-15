# apps/agent

Local Connectors Agent. Runs on a user's machine, dials the gateway **outbound**,
and executes narrow local actions on its behalf.

Runs on **Bun 1.3 and Node 22**: global `fetch`, global `WebSocket`, WebCrypto,
`node:fs`, `node:os`, `node:path` only.

## Commands

```bash
agent pair           # get a code, a human approves it, store the credential
agent run            # open the outbound session and serve jobs
agent status         # device id, connection state, adapters — never the credential
agent revoke-local   # delete the credential stored on THIS machine
```

During development: `bun run --cwd apps/agent pair | start | dev`.

## Environment

| Variable | Meaning |
|---|---|
| `CG_GATEWAY_URL` | relay endpoint, `ws://` or `wss://`. Outbound only. |
| `CG_CONFIG_DIR` | credential store directory. Default `~/.connectors-agent`. |
| `BLENDER_BRIDGE_URL` | loopback Blender bridge. Non-loopback is refused. |

## MVP responsibilities

- pair device;
- securely store device credential;
- maintain outbound authenticated connection;
- announce adapter capabilities;
- receive signed jobs;
- enforce local permissions;
- call local adapters;
- return normalized results;
- upload selected files/results;
- expose status/log UI locally if useful.

## Job pipeline

Fixed order, every inbound frame (`src/jobs.ts`):

```text
parseGatewayMessage -> verifyJob -> replay guard -> local allowlist
  -> adapter execute (timeout + cancellable) -> AgentResult
```

Every failure produces exactly one `AgentResult` with `status: "error"` and a code
from `ERROR_CODES`. Nothing is dropped silently.

## Security

The agent is not a generic remote shell.

- **It never listens.** No server, no bind, no inbound port (`src/socket.ts`).
- **Local allowlist, independent of cloud policy** (`src/allowlist.ts`). An action id
  containing `python`, `shell` or `filesystem`, or carrying risk `R4`, is denied here
  whatever the gateway decided. The most restrictive decision wins (docs/09).
- **Credential store** at `$CG_CONFIG_DIR/config.json`: directory `0700`, file `0600`,
  verified after every write, and refused on load if it is group/world accessible.
- **Signing key pinned.** Learned from the `welcome` frame on first connect, then
  pinned: a different key later is warned about, never adopted (`src/key-store.ts`).
- **Close codes 4001 / 4003 / 4004 stop reconnecting** and tell the user to re-pair.
- Results carry bare file names, never local paths.

Do not implement arbitrary shell execution, Python execution or filesystem access
as foundational primitives. Applications should expose narrow adapters.

## Tests

```bash
bun test apps/agent
```

`src/session-integration.test.ts` drives the whole wire: hello, welcome, a signed
job, the allowlist, the adapter and the result frame, with only the socket faked.
