/**
 * User authentication for the dashboard. Password only for the MVP — the
 * dashboard is the approval surface for device pairing (docs/04), so it needs
 * a human identity, not an AI client identity.
 */
import { convexAuth } from "@convex-dev/auth/server"
import { Password } from "@convex-dev/auth/providers/Password"

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [Password],
})
