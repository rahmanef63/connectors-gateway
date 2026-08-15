# Product definition

## What this product is

Connectors Gateway is an execution layer between AI clients and external capabilities.

It gives an AI one normalized tool surface while hiding implementation differences such as:

- REST APIs;
- OAuth;
- remote MCP;
- local MCP;
- WebSockets;
- local sockets;
- application SDKs;
- desktop add-ons.

## What it is not

It is not the cookbook. The cookbook lives in `rahmanef63/connectors`.

It is not initially:

- Zapier;
- n8n;
- a workflow builder;
- a generic automation marketplace;
- an agent framework;
- a remote desktop product.

## Primary actors

| Actor | Role |
|---|---|
| AI Client | Calls normalized actions |
| Gateway | Authenticates, routes, authorizes, logs |
| Connector | Declares capabilities |
| Cloud Executor | Calls remote service/API |
| Device Relay | Routes jobs to paired devices |
| Local Agent | Executes allowed local actions |
| Local Adapter | Talks to Blender or other local app |
| User | Owns accounts, devices, permissions |

## Product promise

A user connects an application once, then an authorized AI client can use it without learning that application's transport details.

## MVP proof

One gateway must support:

- `careerpack` as a cloud execution target;
- `blender` as a local execution target.

Both should look like ordinary connector actions to the AI.
