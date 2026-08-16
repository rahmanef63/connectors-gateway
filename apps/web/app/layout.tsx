import type { Metadata, Viewport } from "next"
import type { ReactNode } from "react"
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server"

import { ThemeProvider } from "next-themes"

import { Providers } from "./providers"
import { Toaster } from "@/components/toast"
import { BRAND, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE } from "@/lib/site"
import "./globals.css"

// Every string here comes from lib/site.ts, so the tab title, the shell brand
// row and the social description can never disagree.
export const metadata: Metadata = {
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  // Private control plane: never index it, and do not leak the path in a
  // referrer when a user follows a link out.
  robots: { index: false, follow: false },
  referrer: "same-origin",
  // No canonical / no OG image on purpose — see the note in lib/site.ts. The
  // title + description still make a shared link legible in a chat client.
  openGraph: {
    title: SITE_NAME,
    description: SITE_TAGLINE,
    siteName: SITE_NAME,
    type: "website",
  },
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Tracks the OS, which is exact only while the user is on the "system" theme
  // — a `<meta>` tag cannot follow a runtime class swap. Both values are real
  // background tokens, so neither reading is wrong, only less specific.
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: BRAND.dark },
    { media: "(prefers-color-scheme: light)", color: BRAND.light },
  ],
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <ConvexAuthNextjsServerProvider>
      {/* next-themes writes class="dark"/"light" onto <html> before paint, so
          the server markup and the first client render legitimately differ.
          Without this React logs a hydration mismatch on every load. */}
      <html lang="en" suppressHydrationWarning>
        {/* Background, colour and font come from `body` in globals.css — the
            tokens are the SSOT, so nothing is restated as a utility here. */}
        <body className="min-h-dvh">
          {/* attribute="class" toggles class="dark"/class="light" on <html>
              (globals.css: dark is :root, .light overrides). defaultTheme="dark"
              preserves the template's look; disableTransitionOnChange stops a
              colour flash when switching. */}
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange
          >
            {/* Toaster IS the provider: it renders children plus the live
                region, so `useToast()` can never be called outside it.
                Outside Providers, because a toast is not Convex data. */}
            <Toaster>
              <Providers>{children}</Providers>
            </Toaster>
          </ThemeProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  )
}
