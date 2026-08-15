"use client"

// Light / Dark / System over next-themes. The template renders this as a
// dropdown; that shell ships a Dropdown primitive and this app does not, so the
// three options are a segmented group of icon buttons instead — same three
// values, one fewer component to own, and no popup to make keyboard-accessible.
//
// Hydration: next-themes only knows the resolved theme after mount, so the
// server render and the first client render must not depend on it. `mounted`
// gates the pressed state only — the markup shape is identical before and
// after, so nothing shifts and nothing mismatches.
import { useEffect, useState } from "react"
import { useTheme } from "next-themes"

import { Icon, type IconName } from "./icons"
import { cn } from "@/lib/cn"

const OPTIONS: readonly { value: string; label: string; icon: IconName }[] = [
  { value: "light", label: "Light", icon: "sun" },
  { value: "dark", label: "Dark", icon: "moon" },
  { value: "system", label: "System", icon: "monitor" },
]

export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // One-time flip after hydration — the documented next-themes guard, not app
  // state being synced.
  useEffect(() => setMounted(true), [])

  return (
    <div
      role="group"
      aria-label="Theme"
      className="flex items-center gap-0.5 rounded-lg border border-border p-0.5"
    >
      {OPTIONS.map((option) => {
        const active = mounted && theme === option.value
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            aria-pressed={active}
            onClick={() => setTheme(option.value)}
            className={cn(
              "grid h-7 w-7 place-items-center rounded-md transition-colors",
              active
                ? "bg-accent/12 text-accent"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon name={option.icon} className="h-4 w-4" />
          </button>
        )
      })}
    </div>
  )
}
