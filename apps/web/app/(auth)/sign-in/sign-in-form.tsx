"use client";

import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthActions } from "@convex-dev/auth/react";

import { safeInternalPath } from "@/lib/safe-redirect";

type Flow = "signIn" | "signUp";
type PendingAction = "google" | "password" | null;
type FormError = { source: "google" | "password"; message: string };

// Deliberately identical for both password flows: a distinct "no such account"
// message would turn this form into an account-enumeration oracle.
const PASSWORD_FAILURE_COPY =
  "That email and password combination was not accepted.";
const GOOGLE_FAILURE_COPY = "Google sign-in could not be started. Try again.";

const PASSWORD_ERROR_ID = "password-sign-in-error";
const GOOGLE_ERROR_ID = "google-sign-in-error";

type Copy = { heading: string; subtitle: string; action: string; link: string };

const COPY: Readonly<Record<Flow, Copy>> = Object.freeze({
  signIn: {
    heading: "Sign in",
    subtitle: "Sign in to manage devices, connections and permissions.",
    action: "Sign in",
    link: "Create an account instead",
  },
  signUp: {
    heading: "Create an account",
    subtitle: "Your account owns the devices, connections and policies below.",
    action: "Create account",
    link: "I already have an account",
  },
});

type FieldProps = {
  id: string;
  label: string;
  invalid: boolean;
  hint?: string;
} & InputHTMLAttributes<HTMLInputElement>;

function Field({ id, label, invalid, hint, ...props }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy = [invalid ? PASSWORD_ERROR_ID : null, hintId]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="space-y-1.5">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-muted-foreground"
      >
        {label}
      </label>
      <input
        id={id}
        className="field"
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy === "" ? undefined : describedBy}
        {...props}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4 shrink-0">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.53h3.24c1.9-1.75 2.98-4.33 2.98-7.39Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.98-.9 6.64-2.38l-3.24-2.53c-.9.6-2.05.96-3.4.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.61A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.92A6 6 0 0 1 6.08 12c0-.67.12-1.32.31-1.92V7.47H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.53l3.35-2.61Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.95c1.47 0 2.79.5 3.83 1.5l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.47l3.35 2.61C7.18 7.71 9.39 5.95 12 5.95Z"
      />
    </svg>
  );
}

export function SignInForm() {
  const { signIn } = useAuthActions();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [flow, setFlow] = useState<Flow>("signIn");
  const [error, setError] = useState<FormError | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const copy = COPY[flow];
  const signingUp = flow === "signUp";
  const pending = pendingAction !== null;
  const passwordError = error?.source === "password";

  async function onGoogleSignIn() {
    if (pending) return;
    setError(null);
    setPendingAction("google");

    try {
      await signIn("google", {
        redirectTo: safeInternalPath(searchParams.get("next")),
      });
      // Convex Auth owns the browser redirect. Keep the button busy until the
      // current page unloads instead of flashing back to an enabled state.
    } catch {
      setError({ source: "google", message: GOOGLE_FAILURE_COPY });
      setPendingAction(null);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    setPendingAction("password");

    const formData = new FormData(event.currentTarget);
    formData.set("flow", flow);

    try {
      await signIn("password", formData);
      router.push(safeInternalPath(searchParams.get("next")));
      router.refresh();
    } catch {
      setError({ source: "password", message: PASSWORD_FAILURE_COPY });
      setPendingAction(null);
    }
  }

  return (
    <div className="card p-7" aria-busy={pending}>
      <h1 className="text-xl font-semibold tracking-tight">{copy.heading}</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {copy.subtitle}
      </p>

      <button
        type="button"
        aria-disabled={pending}
        aria-describedby={
          error?.source === "google" ? GOOGLE_ERROR_ID : undefined
        }
        onClick={() => void onGoogleSignIn()}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-disabled:pointer-events-none aria-disabled:opacity-50"
      >
        <GoogleMark />
        {pendingAction === "google"
          ? "Connecting to Google…"
          : "Continue with Google"}
      </button>

      {error?.source === "google" ? (
        <p
          id={GOOGLE_ERROR_ID}
          role="alert"
          className="mt-3 text-sm text-destructive"
        >
          {error.message}
        </p>
      ) : null}

      <div className="my-5 flex items-center gap-3" aria-hidden="true">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          or use email
        </span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <Field
          id="email"
          name="email"
          label="Email"
          invalid={passwordError}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
        <Field
          id="password"
          name="password"
          label="Password"
          invalid={passwordError}
          type="password"
          autoComplete={signingUp ? "new-password" : "current-password"}
          minLength={8}
          hint={signingUp ? "At least 8 characters." : undefined}
          required
        />

        {error?.source === "password" ? (
          <p
            id={PASSWORD_ERROR_ID}
            role="alert"
            className="text-sm text-destructive"
          >
            {error.message}
          </p>
        ) : null}

        <button
          type="submit"
          aria-disabled={pending}
          className="btn-primary w-full aria-disabled:opacity-50"
        >
          {pendingAction === "password" ? "Working…" : copy.action}
        </button>
      </form>

      <button
        type="button"
        aria-disabled={pending}
        onClick={() => {
          if (pending) return;
          setFlow(signingUp ? "signIn" : "signUp");
          setError(null);
        }}
        className="mt-4 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline aria-disabled:opacity-50"
      >
        {copy.link}
      </button>
    </div>
  );
}
