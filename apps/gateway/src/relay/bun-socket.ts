/**
 * The slice of Bun's WebSocket surface the relay actually uses, declared here
 * instead of imported from `"bun"`.
 *
 * WHY. `import type { ServerWebSocket } from "bun"` is erased at runtime but not
 * at type-check time: it makes `@types/bun` a compile-time requirement for every
 * project that transitively imports this module. Since docs/20, apps/web mounts
 * the same gateway on Next.js, and that project compiles with the DOM lib and
 * `types: ["node"]` — adding Bun's global type package there to satisfy a type
 * the web build never uses would mean two runtimes' globals in one program.
 *
 * These are structural declarations, so a real `ServerWebSocket` and a real
 * `WebSocketHandler` still satisfy them: `main.ts` hands `relay.websocket`
 * straight to `Bun.serve`, and that assignment is what type-checks the shape
 * against Bun's own. Widen this file only to what the relay calls — every member
 * added here is one more thing a future host has to provide.
 */

/** A connected agent socket, carrying the per-connection state Bun attaches at
 *  upgrade time. Only `data`, `send` and `close` are ever touched. */
export interface RelayServerWebSocket<T> {
  readonly data: T
  send(message: string): number
  close(code?: number, reason?: string): void
}

/** The handler object `Bun.serve({ websocket })` takes. `message` is declared
 *  with Bun's own parameter type (`string | Buffer`-shaped) so the binary-frame
 *  rejection in relay.ts stays a real narrowing rather than a cast. */
export interface RelayWebSocketHandler<T> {
  open?(socket: RelayServerWebSocket<T>): void | Promise<void>
  message(socket: RelayServerWebSocket<T>, message: string | ArrayBufferLike | Uint8Array): void | Promise<void>
  close?(socket: RelayServerWebSocket<T>, code: number, reason: string): void | Promise<void>
}
