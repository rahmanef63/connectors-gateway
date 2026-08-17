---
name: connectors-gateway
description: How to use the Connectors Gateway tools correctly — why the tool list differs per user and per moment, what the APPROVAL_REQUIRED and DEVICE_OFFLINE refusals mean, and why a refusal is usually not something to retry. Read this before the first gateway tool call.
---

# Connectors Gateway

Every tool from this server runs against **someone's real accounts and their
own machine** — sending the mail, opening the issue, rendering the file. Treat
each call as an action taken in the open, not a query against a sandbox.

These instructions live here and not in `CLAUDE.md`: that file is not loaded as
context for a plugin.

## The tool list is not fixed

Tools are built from **this user's** connectors at the moment they ask, so the
list legitimately differs between two people and between two sessions. Do not
cache it, and do not assume a tool you used before is still there — a connector
can be disconnected, and a local one disappears when that machine goes offline.

Tool names are the connector's action id with dots flattened to underscores:
`composio.tools.search` is called as `composio_tools_search`.

## Refusals mean different things. Only one is worth retrying.

| What comes back | What it means | Do |
|---|---|---|
| `APPROVAL_REQUIRED` | The call is queued for the human to approve in the dashboard | **Stop. Tell them to approve it.** Calling again just queues the same thing |
| `POLICY_DENIED` | Their permissions do not allow this action | Stop, say which action was refused. Do not look for another route to the same effect |
| `DEVICE_OFFLINE` | A local action, and the machine that runs it is not connected | Say which machine has to be awake |
| `CONNECTION_MISSING` | That connector was never connected | Point them at the dashboard to connect it |
| `INSUFFICIENT_SCOPE` | The stored credential is real but not allowed to do this | They need to reconnect with wider access — a retry will never work |
| `TIMEOUT`, `UPSTREAM_ERROR` | The far end failed or was slow | **This** is the one that can be retried |

An approval is bound to the **exact** call — the connector, the action and the
arguments. Changing an argument after approval makes it a different call that
needs approving again. That is deliberate: it is what stops "delete issue 5"
from being replayed as "delete issue 500".

## Search before you execute

Some connectors front thousands of upstream tools and their exact names are not
guessable. Where a connector offers a search or schema action, call it first and
use the name it returns. A guessed name fails; a guessed argument can act on the
wrong record, which is worse because it succeeds.

## When the destructive flag is set, say so first

Tool annotations here are mapped faithfully from each connector's manifest —
nothing widens `readOnly` or hides `destructive`. If a tool is marked
destructive, tell the person what it will do **before** calling it, in the same
message, and let them answer. The approval gate is a backstop, not a substitute
for saying what you are about to do.

## Connecting

If the tools are missing entirely, the gateway is not connected yet. Sign in at
<https://connectors.rahmanef.com>, connect a connector there, then reconnect
this server. Authorization is OAuth — there is no key to paste, and you should
never ask them for one.
