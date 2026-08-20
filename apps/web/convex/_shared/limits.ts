/**
 * Bounded reads. A bare `.collect()` is forbidden: every list query takes a
 * hard page size so one user's row count can never become the deployment's
 * latency budget.
 */
export const MAX_DEVICES_PER_USER = 200
export const MAX_CONNECTIONS_PER_OWNER = 200
/** One owner rarely holds more than a couple of connections per connector. */
export const MAX_CONNECTIONS_PER_CONNECTOR = 10
export const MAX_POLICY_RULES_PER_USER = 500
export const MAX_AUDIT_PAGE_SIZE = 100
export const MAX_PENDING_APPROVALS_PER_OWNER = 100
/** How long an approval stays usable. Short on purpose: a confirmation the
 *  user gave twenty minutes ago is not consent for what the model does now. */
export const APPROVAL_TTL_MS = 10 * 60 * 1000
/** Enough of the arguments to recognise the call, not enough to be a payload. */
export const MAX_INPUT_PREVIEW_LENGTH = 300
/** Rows reclaimed from the approval table per unattended maintenance pass. */
export const APPROVAL_SWEEP_BATCH = 200

/**
 * An authorization code is redeemed by a machine, immediately. Two minutes is
 * generous for that and still far under RFC 6749's ten-minute ceiling; the
 * window only has to survive clock skew and a slow host, not a human.
 */
export const OAUTH_CODE_TTL_MS = 2 * 60 * 1000

/**
 * How long an OAuth access token lives.
 *
 * Long, deliberately: this server issues no refresh tokens, so a short TTL does
 * not improve security — it just drops the connection and asks the human to
 * consent again, and a user trained to click Approve every week is a user who
 * approves anything. What bounds the risk instead is that the token is an
 * `apiKeys` row like any other: it is listed and revocable in the dashboard,
 * it is replaced on reconnect, and R2/R3 actions still stop at the approval
 * queue no matter how old the token is.
 */
export const OAUTH_TOKEN_TTL_MS = 90 * 24 * 60 * 60 * 1000

/** Per RFC 7591 registration. A real client needs one or two. */
export const MAX_REDIRECT_URIS = 5
export const MAX_OAUTH_CLIENT_NAME_LENGTH = 100
/** Bounds the replace-on-reissue scan; one user cannot have more live grants. */
export const MAX_OAUTH_TOKENS_SCANNED = 200

/**
 * How long a registered client may sit without ever completing an exchange
 * before the sweeper removes it. Generous on purpose: a human who registers a
 * client, gets distracted and finishes the flow next week must still find it
 * there. Only never-used rows are eligible at all.
 */
export const OAUTH_CLIENT_IDLE_MS = 30 * 24 * 60 * 60 * 1000

/**
 * Rows deleted per table per sweep. Small enough that the pass cannot approach
 * a transaction limit on a deployment that has fallen far behind — which is
 * precisely the deployment where a cleanup job failing would matter most.
 * Leftovers go on the next tick; the sweep is not required to catch up at once.
 */
export const OAUTH_SWEEP_BATCH = 200

export const MIN_DISPLAY_NAME_LENGTH = 1
export const MAX_DISPLAY_NAME_LENGTH = 64
export const MIN_PAIRING_CODE_LENGTH = 6
export const MAX_PAIRING_CODE_LENGTH = 32
export const MAX_IDENTIFIER_LENGTH = 128
