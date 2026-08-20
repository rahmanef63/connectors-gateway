# Policy and approvals

## Purpose

A valid AI session is not blanket permission. Every action is evaluated at call time, and
high-risk calls stop for a separate human decision without exposing connector or device
credentials.

## Decision order

The baseline comes from the action risk class:

| Risk | Default |
| --- | --- |
| R0–R1 | `ALLOW` |
| R2–R3 | `REQUIRE_APPROVAL` |
| R4 | `DENY` |

Per-user connector/action rules may make that stricter. The most restrictive applicable
decision wins. Host-side confirmation metadata is additional UX, never a replacement for
this server-side policy check; a write must not be mislabeled read-only to avoid a host prompt.

## Exact-call approval lifecycle

1. A gated call computes a SHA-256 request hash over connector ID, action ID, and canonicalised
   arguments. Key order is normalised; argument values and array order are not.
2. If no usable approval exists, the gateway writes one `pending` row and returns
   `APPROVAL_REQUIRED`. Failure to persist still refuses the call.
3. The dashboard shows only the signed-in user's live pending rows and a short, server-truncated
   argument preview. Approve or deny changes state but **does not execute anything**.
4. The caller must explicitly retry. Only the same owner and exact request hash can claim an
   `approved` row. Claiming is one Convex mutation that changes it to `consumed`, so concurrent
   retries cannot share one decision.
5. A denied row is not revived by repeated requests. A different argument produces a different
   hash and therefore needs a new decision.

Approvals expire after ten minutes. The expiry is enforced on every claim, independently of
maintenance. Each owner may have at most 100 pending rows; the oldest pending row is removed
before a new distinct one is inserted at the cap. An hourly bounded sweep reclaims expired
pending, approved, denied, and consumed rows.

## Dashboard UX

The approvals page must show the connector, action, risk class, exact-call preview, and expiry.
The buttons are **Approve once** and **Deny**. A mutation failure displays a safe error and leaves
the call unauthorized. Push notifications or desktop prompts may be added later, but they must
preserve the same exact-call, single-use semantics.
