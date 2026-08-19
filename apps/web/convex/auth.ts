/**
 * Human authentication for the dashboard approval surface.
 *
 * Google is the preferred low-friction path. Password remains available for
 * existing users and local recovery. The Google provider explicitly disables
 * implicit email account linking; see google_provider.ts for the threat model.
 */
import { convexAuth } from "@convex-dev/auth/server";
import { Password } from "@convex-dev/auth/providers/Password";

import { googleProvider } from "./google_provider";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [googleProvider, Password],
});
