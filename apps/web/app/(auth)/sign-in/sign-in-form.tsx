"use client"

import { useState, type FormEvent, type InputHTMLAttributes } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthActions } from "@convex-dev/auth/react"

import { safeInternalPath } from "@/lib/safe-redirect"

type Flow = "signIn" | "signUp"

// Deliberately identical for both flows: a distinct "no such account" message
// would turn this form into an account-enumeration oracle.
const FAILURE_COPY = "That email and password combination was not accepted."

/** The error paragraph every invalid field points at with aria-describedby. */
const ERROR_ID = "sign-in-error"

type Copy = { heading: string; subtitle: string; action: string; link: string }

// All the copy for a flow in one place, so a state cannot half-exist.
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
})

type FieldProps = { id: string; label: string; invalid: boolean; hint?: string } & InputHTMLAttributes<HTMLInputElement>

/**
 * One labelled input. Every field goes through it, so the label, the error
 * wiring and the shared `.field` look cannot drift between them.
 */
function Field({ id, label, invalid, hint, ...props }: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined
  const describedBy = [invalid ? ERROR_ID : null, hintId].filter(Boolean).join(" ")

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-muted-foreground">
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
  )
}

export function SignInForm() {
  const { signIn } = useAuthActions()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [flow, setFlow] = useState<Flow>("signIn")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const copy = COPY[flow]
  const signingUp = flow === "signUp"

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    // The submit button stays focusable while in flight (aria-disabled, not
    // disabled), so the double-submit guard lives here.
    if (pending) return
    setError(null)
    setPending(true)

    const formData = new FormData(event.currentTarget)
    formData.set("flow", flow)

    try {
      await signIn("password", formData)
      // `?next=` is attacker-controllable — it must be validated, not trusted.
      router.push(safeInternalPath(searchParams.get("next")))
      router.refresh()
    } catch {
      // Never quote the server's error: the same copy for every failure is what
      // keeps this form from confirming who has an account.
      setError(FAILURE_COPY)
      setPending(false)
    }
  }

  return (
    <div className="card p-7">
      <h1 className="text-xl font-semibold tracking-tight">{copy.heading}</h1>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy.subtitle}</p>

      <form onSubmit={onSubmit} aria-busy={pending} noValidate className="mt-6 space-y-4">
        <Field
          id="email"
          name="email"
          label="Email"
          invalid={error !== null}
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          required
        />
        <Field
          id="password"
          name="password"
          label="Password"
          invalid={error !== null}
          type="password"
          autoComplete={signingUp ? "new-password" : "current-password"}
          minLength={8}
          hint={signingUp ? "At least 8 characters." : undefined}
          required
        />

        {error ? (
          <p id={ERROR_ID} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        {/* aria-disabled, not disabled: a disabled button drops out of the tab
            order mid-submit and dumps keyboard focus on <body>. */}
        <button
          type="submit"
          aria-disabled={pending}
          className="btn-primary w-full aria-disabled:opacity-50"
        >
          {pending ? "Working…" : copy.action}
        </button>
      </form>

      <button
        type="button"
        aria-disabled={pending}
        onClick={() => {
          if (pending) return
          setFlow(signingUp ? "signIn" : "signUp")
          setError(null)
        }}
        className="mt-4 text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline aria-disabled:opacity-50"
      >
        {copy.link}
      </button>
    </div>
  )
}
