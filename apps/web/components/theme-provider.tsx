"use client"

// Thin wrapper over next-themes. attribute="class" toggles class="dark" /
// class="light" on <html> (see app/globals.css — dark is :root, .light
// overrides). defaultTheme="dark" preserves the template's look;
// disableTransitionOnChange stops a colour flash when switching. One home for
// the config so the picker and the layout never re-declare it.
import { ThemeProvider as NextThemesProvider } from "next-themes"
import type { ComponentProps } from "react"

type Props = { children: ComponentProps<typeof NextThemesProvider>["children"] }

export function ThemeProvider({ children }: Props) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}
