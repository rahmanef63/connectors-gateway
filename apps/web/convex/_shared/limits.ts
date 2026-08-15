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

/** Pairing codes are a lookup key, not a list — one row is the only answer. */
export const SINGLE_ROW = 1

export const MIN_DISPLAY_NAME_LENGTH = 1
export const MAX_DISPLAY_NAME_LENGTH = 64
export const MIN_PAIRING_CODE_LENGTH = 6
export const MAX_PAIRING_CODE_LENGTH = 32
export const MAX_IDENTIFIER_LENGTH = 128
