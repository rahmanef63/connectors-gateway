# Threat model

## Threat: attacker reaches local Blender port

Mitigation:

- bind bridge to loopback;
- no inbound public port;
- agent is the only network mediator.

## Threat: stolen device credential

Mitigation:

- OS secure storage;
- short server-side revocation path;
- credential rotation;
- device/session visibility;
- optionally add device-bound keys later.

## Threat: replayed job

Mitigation:

- signed job id;
- issued/expiry timestamps;
- nonce or replay cache;
- reject duplicate job ids.

## Threat: prompt injection causes destructive action

Mitigation:

- action-level policy;
- risk classes;
- approval;
- local allowlist;
- narrow tools instead of arbitrary code.

## Threat: malicious connector input accesses local files

Mitigation:

- schema validation;
- path allowlists;
- no raw filesystem tool by default;
- explicit export/import roots.

## Threat: gateway compromise exposes OAuth tokens

Mitigation:

- encryption at rest;
- least privilege scopes;
- secrets isolation;
- token rotation/revocation;
- redact logs.

## Threat: connector impersonates another connector

Mitigation:

- signed/validated manifests if external distribution is added;
- trusted built-in registry for MVP;
- connector id/version pinning.

## Threat: result contains sensitive local path

Mitigation:

- normalize result metadata;
- strip unnecessary absolute paths;
- upload selected output file to controlled storage.
