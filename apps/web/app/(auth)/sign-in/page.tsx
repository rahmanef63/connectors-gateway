import type { Metadata } from "next"
import { Suspense } from "react"

import { SignInForm } from "./sign-in-form"
import { Skeleton } from "@/components/ui/skeleton"

export const metadata: Metadata = { title: "Sign in" }

export default function SignInPage() {
  return (
    // The form reads `?next=`, so it needs a Suspense boundary of its own.
    <Suspense fallback={<Skeleton className="h-[26rem] w-full" />}>
      <SignInForm />
    </Suspense>
  )
}
