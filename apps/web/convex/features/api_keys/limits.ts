/**
 * Bounds for API key issuance. Kept in one module so the mutation that enforces
 * a cap and the query that pages a list can never disagree about it.
 */

/**
 * One key per AI client is the shape of real usage (Claude Desktop, Cursor, a
 * script, a spare during rotation). Twenty is generous for that and still small
 * enough that the active set is a glance, not a page.
 */
export const MAX_ACTIVE_API_KEYS_PER_USER = 20

/**
 * Revoked keys stay as rows forever (the gateway must be able to tell revoked
 * from unknown), so a user's row count only grows. `issue` counts the active
 * ones by scanning this many of the newest rows; a user who has burned through
 * more than this is refused rather than counted wrongly — see `mutations.ts`.
 */
export const MAX_API_KEY_ROWS_SCANNED = 500

/** Page size for the dashboard list. Newest first; no bare `.collect()`. */
export const MAX_API_KEYS_PAGE = 200

/**
 * Key ids are gateway-style opaque strings, `key_<32 hex>`, minted the same way
 * `@cg/core`'s `newId` mints `conn_…` / `dev_…`. The prefix is part of the
 * credential the user pastes (`cgk_key_<32 hex>_<secret>`) and is therefore a
 * stable, published format — changing it invalidates every issued key.
 *
 * `@cg/core`'s `IdKind` has no `apiKey` member, and adding one would edit a
 * package this feature does not own, so the id is minted locally in the
 * identical shape.
 */
export const API_KEY_ID_PREFIX = "key"

/** A human label, same bounds as a device display name. */
export const MIN_API_KEY_LABEL_LENGTH = 1
export const MAX_API_KEY_LABEL_LENGTH = 64
