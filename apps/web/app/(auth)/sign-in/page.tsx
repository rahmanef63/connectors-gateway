import type { Metadata } from "next"
import { Suspense } from "react"

import { SignInForm } from "./sign-in-form"
import { Skeleton } from "@/components/skeleton"

export const metadata: Metadata = { title: "Sign in" }

export default function SignInPage() {
  return (
    // The form reads `?next=`, so it needs a Suspense boundary of its own. The
    // fallback is the card's own footprint, so nothing shifts when it resolves.
    <Suspense
      fallback={
        <div role="status" aria-label="Loading sign-in form">
          <Skeleton className="h-[24rem] w-full" />
        </div>
      }
    >
      <SignInForm />
    </Suspense>
  )
}
