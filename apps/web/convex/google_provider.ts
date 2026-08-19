import Google, { type GoogleProfile } from "@auth/core/providers/google";

/** Stable provider id used by the client-side sign-in button and callback path. */
export const GOOGLE_PROVIDER_ID = "google" as const;
export const GOOGLE_CALLBACK_PATH =
  `/api/auth/callback/${GOOGLE_PROVIDER_ID}` as const;

const GOOGLE_PROFILE_ERROR =
  "Google sign-in requires a verified email address.";

/**
 * Accept only the identity fields the dashboard needs.
 *
 * `emailVerified` is intentionally NOT returned. Convex Auth otherwise links a
 * new OAuth identity to an existing user by email. Because password sign-up is
 * available without email verification, implicit linking would enable a
 * pre-account-hijacking attack: an attacker could register someone else's
 * email first and inherit that account when the real owner signs in with
 * Google. Existing password accounts therefore stay separate until an
 * explicit authenticated linking flow is implemented.
 */
export function googleUserProfile(profile: GoogleProfile) {
  const id = typeof profile.sub === "string" ? profile.sub.trim() : "";
  const email =
    typeof profile.email === "string" ? profile.email.trim().toLowerCase() : "";

  if (profile.email_verified !== true || id === "" || email === "") {
    throw new Error(GOOGLE_PROFILE_ERROR);
  }

  const name =
    typeof profile.name === "string" && profile.name.trim() !== ""
      ? profile.name.trim()
      : email;
  const image =
    typeof profile.picture === "string" && profile.picture.trim() !== ""
      ? profile.picture.trim()
      : null;

  return {
    id,
    name,
    email,
    ...(image === null ? {} : { image }),
  };
}

/**
 * Auth.js reads AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET from the Convex runtime.
 * `select_account` is enough for authentication; no offline Google API access
 * or refresh token is requested.
 */
export const googleProvider = Google({
  allowDangerousEmailAccountLinking: false,
  authorization: { params: { prompt: "select_account" } },
  profile: googleUserProfile,
});
