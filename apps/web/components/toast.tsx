"use client"

/**
 * Dependency-free toast system — this replaces sonner entirely.
 *
 * Mount it ONCE, wrapping the app (app/layout.tsx):
 *
 *   <Toaster>{children}</Toaster>
 *
 * then anywhere below it:
 *
 *   const { toast } = useToast()
 *   toast("Machine approved.")
 *   toast("Could not sign out. Try again.", { tone: "danger" })
 *
 * `Toaster` is the provider — it renders the children AND the live region, so
 * there is no way to mount the region outside the context that feeds it.
 * Colours come from the tone SSOT in components/status-badge.tsx; this file
 * names no colour of its own.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"

import { TONE_CLASSES, type Tone } from "@/components/status-badge"
import { cn } from "@/lib/cn"

/** Long enough to read a sentence, short enough not to sit on the UI. */
const DISMISS_AFTER_MS = 5000

export type ToastOptions = {
  /** Defaults to `neutral`. `danger` is the failure tone. */
  tone?: Tone
}

export type ToastFn = (message: string, options?: ToastOptions) => void

type ToastItem = { id: number; message: string; tone: Tone }

const ToastContext = createContext<ToastFn | null>(null)

/**
 * Throws when there is no `<Toaster>` above the caller. That is deliberate: a
 * silently swallowed toast is a mutation failure the user never sees.
 */
export function useToast(): { toast: ToastFn } {
  const toast = useContext(ToastContext)
  if (toast === null) {
    throw new Error("useToast must be used inside <Toaster> (mounted in app/layout.tsx)")
  }
  // `toast` itself is stable (useCallback), so it is safe in a dependency
  // array even though this wrapper object is new on every render.
  return { toast }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(0)
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>())

  // Nothing may outlive the provider: a pending dismissal after unmount is a
  // setState on a dead tree.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const timer of pending) clearTimeout(timer)
      pending.clear()
    }
  }, [])

  const toast = useCallback<ToastFn>((message, { tone = "neutral" } = {}) => {
    const id = nextId.current++
    setToasts((all) => [...all, { id, message, tone }])
    const timer = setTimeout(() => {
      timers.current.delete(timer)
      setToasts((all) => all.filter((item) => item.id !== id))
    }, DISMISS_AFTER_MS)
    timers.current.add(timer)
  }, [])

  return (
    <ToastContext.Provider value={toast}>
      {children}
      {/* Announced, not focus-stealing: polite so it waits for the screen
          reader to finish, pointer-events-none so it never eats a click. */}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              "card pointer-events-auto max-w-sm px-4 py-2.5 text-sm shadow-lg",
              TONE_CLASSES[item.tone].border,
              TONE_CLASSES[item.tone].text,
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** The name app/layout.tsx mounts. Same component — see the header. */
export { ToastProvider as Toaster }
