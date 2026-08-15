"use client"

import { ConvexReactClient } from "convex/react"
import { CONVEX_URL } from "./env"

let client: ConvexReactClient | undefined

/**
 * Lazy singleton so a missing NEXT_PUBLIC_CONVEX_URL surfaces as a rendered
 * error boundary instead of an unreadable module-evaluation crash.
 */
export function convexClient(): ConvexReactClient {
  if (CONVEX_URL === "") {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set. Copy .env.example and fill it in.")
  }
  client ??= new ConvexReactClient(CONVEX_URL)
  return client
}
