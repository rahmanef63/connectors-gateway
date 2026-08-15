"use client"

import type { ReactNode } from "react"
import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs"

import { convexClient } from "@/lib/convex-client"

export function Providers({ children }: { children: ReactNode }) {
  return <ConvexAuthNextjsProvider client={convexClient()}>{children}</ConvexAuthNextjsProvider>
}
