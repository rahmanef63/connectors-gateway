"use client"

import { ConvexReactClient } from "convex/react"

let client: ConvexReactClient | undefined

/**
 * Lazy singleton so a missing NEXT_PUBLIC_CONVEX_URL surfaces as a rendered
 * error boundary instead of an unreadable module-evaluation crash.
 *
 * Literal `process.env.NEXT_PUBLIC_*` member access: Next inlines it at build
 * time, and a computed lookup would resolve to undefined in the browser.
 */
export function convexClient(): ConvexReactClient {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL ?? ""
  if (url === "") {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set. Copy .env.example and fill it in.")
  }
  client ??= new ConvexReactClient(url)
  return client
}
