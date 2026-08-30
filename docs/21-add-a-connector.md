# Adding a connector

The point of the template. A remote-MCP connector is **one JSON file and one
import line** — no package, no adapter class, no code.

Read `docs/06-connector-contract.md` for what the fields mean. This is the
walkthrough.

## 1. Copy the example

```bash
cp adapters/remote-mcp/connectors/example.connector.json \
   adapters/remote-mcp/connectors/acme.connector.json
```

`example.connector.json` is annotated for this purpose: one read, one write, one
destructive action, at three different risk levels.

## 2. Fill in the identity

```json
{
  "id": "acme",
  "name": "Acme",
  "version": "0.1.0",
  "executor": "cloud",
  "endpoint": "https://mcp.acme.com/mcp"
}
```

`id` is the namespace for every action id below it, and it is global — two
connectors cannot claim the same action id, because the MCP tool namespace is
flat and the registry refuses the ambiguity at boot.

## 3. Describe the auth

```json
"auth": { "type": "oauth2", "fields": [] }
```

`oauth2` means the dashboard's Connect button walks the user through the
upstream's authorization flow; the manifest's `verification` block tells it
where to look. `api_key` / `bearer` means the connect form renders exactly the
`fields` you declare — nothing more, and a field marked `"secret": true` is never
echoed back to the browser.

## 4. Write the actions — the part that matters

Everything else is bookkeeping. The actions are the contract, and they are read
by a language model, not a human.

```json
{
  "id": "acme.invoice.create",
  "title": "Create invoice",
  "description": "…",
  "inputSchema": { "$schema": "https://json-schema.org/draft/2020-12/schema", … },
  "risk": "R1",
  "annotations": { "readOnly": false, "destructive": false, "idempotent": false },
  "x-upstream": "create_invoice",
  "requiredScopes": ["mcp.write"]
}
```

Four things earn their keep here.

**`description` is a prompt, not documentation.** Say what the fields mean, which
ones the AI must *ask the user about* rather than infer, and what happens by
default. The difference between "Record a job application" and a description that
names `source` as something to ask about is the difference between a tool that
works and one that invents plausible data.

**`inputSchema` is the trust boundary.** The AI's arguments are untrusted until
this schema says otherwise; validation happens before anything reaches an
adapter. `"additionalProperties": false` is not optional politeness — it is what
stops an argument you never declared from reaching an upstream that might honour
it.

**`risk` decides what needs a human.** R0 reads, R1 ordinary writes, R2+ enters
the approval path. Getting this wrong is the one mistake here that has
consequences: an under-classified destructive action is one an AI can take
unattended.

**`x-upstream` is the only place the upstream's own tool name appears.** It never
leaves the gateway; the AI client sees your normalized id.

## 5. Register it

```ts
// adapters/remote-mcp/src/connectors.ts
import acme from "../connectors/acme.connector.json"

export const REMOTE_MCP_MANIFESTS = Object.freeze([
  …,
  validateManifest(acme),
])
```

`validateManifest` runs at module load, so a malformed manifest stops the process
rather than serving a broken connector.

## 6. Enable it

```
CONNECTORS_ENABLED=acme
```

Shipping and serving are separate (`@cg/core` → `selectConnectors`). A clone can
therefore keep the reference manifests in the tree — and keep merging template
updates cleanly — while serving only its own.

## 7. Prove it

```bash
bun run validate                  # types + both test suites
bun run verify:remote-endpoints   # probes the endpoints the manifests declare
```

Then connect it in the dashboard and call one read action from an AI client
before you trust any write.

## Removing the reference connectors

`careerpack`, `composio`, `content`, `mso` and `rahmanef` are real, working
manifests kept as reference material. Read them — between them they cover bearer
auth, API keys, OAuth 2.0 with dynamic client registration, and a 20-action
surface — then either leave them shipped-but-disabled (`CONNECTORS_ENABLED`
without their ids, the low-conflict option) or delete the files and their import
lines.

## Local connectors

A connector that reaches software on someone's own machine is a different shape:
it ships a manifest here but its adapter runs inside `apps/agent`, never in the
gateway. `adapters/blender` is the worked example, and
`docs/17-exposing-local-software.md` is the reasoning. Note the deployment
consequence in `docs/20-vercel-template.md`: local connectors need the Bun
gateway, not Vercel.
