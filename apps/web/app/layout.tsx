import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server"
import { Toaster } from "sonner"

import { Providers } from "./providers"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "Connectors Gateway",
    template: "%s · Connectors Gateway",
  },
  description: "Control plane for devices, connections, permissions and audit.",
  // Private control plane: never index it, and do not leak the path in a
  // referrer when a user follows a link out.
  robots: { index: false, follow: false },
  referrer: "same-origin",
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en">
        <body className="min-h-dvh bg-background text-foreground antialiased">
          <Providers>{children}</Providers>
          <Toaster position="top-right" closeButton />
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  )
}
