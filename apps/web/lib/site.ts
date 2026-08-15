/**
 * Brand + copy SSOT for the dashboard.
 *
 * Ported from template-convex-starter's `lib/site.ts`. Anything that names the
 * product, describes it, or paints its chrome colour lives here — the metadata
 * in `app/layout.tsx`, the shell brand row, the focus-screen wordmark and the
 * OG description all read these constants. After this file, nothing hardcodes
 * the product name: a rename is one edit.
 *
 * There is no `siteUrl()` here (the template has one). This is a private,
 * `noindex` control plane with no canonical URL, no sitemap and no OG image, so
 * a metadataBase would be a URL invented for no reader.
 */

export const SITE_NAME = "Connectors Gateway"

/** The sidebar/wordmark second line — what kind of thing this is. */
export const SITE_ROLE = "Control plane"

/** One line, used as the OG/social description. */
export const SITE_TAGLINE = "One gateway between your AI clients and your machines."

/** The `<meta name="description">` line — longer, says what the screens do. */
export const SITE_DESCRIPTION =
  "Control plane for devices, connections, permissions and audit. Approve the machines an AI client may act on, and see every action it took."

/**
 * Mirrors the `:root` / `.light` tokens in `app/globals.css`. Duplicated on
 * purpose: `viewport.themeColor` is serialised into `<head>` at build time, and
 * nothing outside the browser can read a CSS custom property. Keep the two in
 * sync — these are the only hexes in the app outside globals.css.
 */
export const BRAND = {
  dark: "#0a0a0a",
  light: "#fafafa",
  accent: "#f5b544",
} as const
