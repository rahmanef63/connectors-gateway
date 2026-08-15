/**
 * Bounded waiting. An adapter that ignores its AbortSignal must still not be
 * able to hold a job slot forever (docs/05 "Reliability: timeout").
 */
import { GatewayError } from "@cg/core"

export const DEFAULT_JOB_TIMEOUT_MS = 60_000

/**
 * `Promise.race` attaches a handler to `work`, so a late rejection from the
 * losing promise is already handled — it can never become an unhandled
 * rejection that kills the session.
 */
export async function raceTimeout<T>(work: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const guard = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new GatewayError("TIMEOUT", message)), timeoutMs)
  })
  try {
    return await Promise.race([work, guard])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
