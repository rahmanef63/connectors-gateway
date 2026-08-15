/**
 * Terminal output for the local user.
 *
 * Nothing that reaches a logger may carry the device credential, a token or an
 * absolute path (AGENTS.md P0). Callers pass fixed strings and ids only — the
 * logger deliberately takes no structured payload, so there is nothing to leak.
 */
export type Logger = {
  info(message: string): void
  warn(message: string): void
  error(message: string): void
}

export type LoggerOptions = {
  write?: (line: string) => void
  now?: () => Date
}

export function createLogger(options: LoggerOptions = {}): Logger {
  const write = options.write ?? ((line: string) => console.log(line))
  const now = options.now ?? (() => new Date())
  const line = (level: string, message: string): void => {
    write(`${now().toISOString()} ${level} ${message}`)
  }
  return {
    info: (message) => line("info ", message),
    warn: (message) => line("warn ", message),
    error: (message) => line("error", message),
  }
}

export const silentLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
}
