/**
 * The one place the agent touches a real WebSocket.
 *
 * THE AGENT NEVER LISTENS ON A SOCKET. There is no server, no bind, no port —
 * only this outbound dial (AGENTS.md invariants 1 and 2, docs/01 "Why local apps
 * do not need a public IP"). Anything that would accept an inbound connection
 * belongs nowhere in this app.
 *
 * The indirection exists so the session can be tested without a network: the
 * session depends on `SocketFactory`, not on the global WebSocket.
 */
export type SocketEvents = {
  open(): void
  /** Text frames only; binary frames are dropped before this is called. */
  message(data: string): void
  close(code: number, reason: string): void
  error(): void
}

export type AgentSocket = {
  send(data: string): void
  close(code?: number, reason?: string): void
}

export type SocketFactory = (url: string, events: SocketEvents) => AgentSocket

/** Normal closure — the agent is shutting down, not failing. */
export const NORMAL_CLOSURE = 1000

export const webSocketFactory: SocketFactory = (url, events) => {
  const socket = new WebSocket(url)

  socket.addEventListener("open", () => events.open())
  socket.addEventListener("message", (event: MessageEvent) => {
    if (typeof event.data === "string") events.message(event.data)
  })
  socket.addEventListener("close", (event: CloseEvent) => events.close(event.code, event.reason))
  // The error event carries no useful, safe detail: the close event follows.
  socket.addEventListener("error", () => events.error())

  return {
    send: (data: string) => socket.send(data),
    close(code?: number, reason?: string): void {
      try {
        socket.close(code, reason)
      } catch {
        // Already closed. Nothing to do and nothing to report.
      }
    },
  }
}
