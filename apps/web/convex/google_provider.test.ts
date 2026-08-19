// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  GOOGLE_CALLBACK_PATH,
  GOOGLE_PROVIDER_ID,
  googleProvider,
  googleUserProfile,
} from "./google_provider";

const verifiedProfile = {
  aud: "client",
  azp: "client",
  email: "  User@Example.com ",
  email_verified: true,
  exp: 2,
  given_name: "User",
  iat: 1,
  iss: "https://accounts.google.com",
  name: "  Example User  ",
  picture: " https://images.example/avatar.png ",
  sub: " google-subject ",
};

describe("Google dashboard auth provider", () => {
  it("uses the stable provider and callback identifiers", () => {
    expect(GOOGLE_PROVIDER_ID).toBe("google");
    expect(GOOGLE_CALLBACK_PATH).toBe("/api/auth/callback/google");
    expect(googleProvider.id).toBe("google");
    expect(googleProvider.type).toBe("oidc");
  });

  it("disables implicit account linking and asks the user to choose an account", () => {
    const options = googleProvider.options as Record<string, unknown>;
    expect(options.allowDangerousEmailAccountLinking).toBe(false);
    expect(options.authorization).toEqual({
      params: { prompt: "select_account" },
    });
  });

  it("normalizes a verified Google identity without marking it linkable by email", () => {
    const profile = googleUserProfile(verifiedProfile);
    expect(profile).toEqual({
      id: "google-subject",
      name: "Example User",
      email: "user@example.com",
      image: "https://images.example/avatar.png",
    });
    expect(profile).not.toHaveProperty("emailVerified");
  });

  it.each([
    { ...verifiedProfile, email_verified: false },
    { ...verifiedProfile, email: "" },
    { ...verifiedProfile, sub: "" },
  ])("rejects an unusable or unverified Google profile", (profile) => {
    expect(() => googleUserProfile(profile)).toThrow(
      "Google sign-in requires a verified email address.",
    );
  });
});
