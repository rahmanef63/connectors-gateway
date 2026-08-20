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
