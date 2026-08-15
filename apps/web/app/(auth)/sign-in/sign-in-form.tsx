"use client"

import { useState, type FormEvent } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { useAuthActions } from "@convex-dev/auth/react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { safeInternalPath } from "@/lib/safe-redirect"

type Flow = "signIn" | "signUp"

// Deliberately identical for both flows: a distinct "no such account" message
// would turn this form into an account-enumeration oracle.
const FAILURE_COPY = "That email and password combination was not accepted."

export function SignInForm() {
  const { signIn } = useAuthActions()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [flow, setFlow] = useState<Flow>("signIn")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
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
      setError(FAILURE_COPY)
      setPending(false)
    }
  }

  const signingUp = flow === "signUp"

  return (
    <Card>
      <CardHeader>
        <CardTitle>{signingUp ? "Create an account" : "Sign in"}</CardTitle>
        <CardDescription>
          {signingUp
            ? "Your account owns the devices, connections and policies below."
            : "Sign in to manage devices, connections and permissions."}
        </CardDescription>
      </CardHeader>

      <form onSubmit={onSubmit} noValidate>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              aria-invalid={error !== null}
              placeholder="you@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete={signingUp ? "new-password" : "current-password"}
              required
              minLength={8}
              aria-invalid={error !== null}
            />
            {signingUp ? (
              <p className="text-xs text-muted-foreground">At least 8 characters.</p>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </CardContent>

        <CardFooter className="mt-6 flex-col items-stretch gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Working…" : signingUp ? "Create account" : "Sign in"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={pending}
            onClick={() => {
              setFlow(signingUp ? "signIn" : "signUp")
              setError(null)
            }}
          >
            {signingUp ? "I already have an account" : "Create an account instead"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}
