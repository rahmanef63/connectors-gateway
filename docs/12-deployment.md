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

## Scaling boundary

A persistent relay is stateful by connection presence, but job metadata and device ownership should live in shared storage so multiple relay instances can coexist later.

Do not optimize for global scale before MVP correctness and security.
