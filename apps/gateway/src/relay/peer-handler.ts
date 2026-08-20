/** Authenticated internal HTTP endpoint used by another gateway replica. */
import { open, seal } from "@cg/auth"
import { GatewayError, httpStatusFor, toGatewayError } from "@cg/core"
import { parseSignedJob } from "@cg/protocol"
import type { Dispatcher } from "./dispatch"
import type { SocketRegistry } from "./sockets"
import { verifyPeerRequest } from "./peer-auth"

const MAX_PEER_REQUEST_CHARS = 2 * 1024 * 1024
const ID = /^[A-Za-z0-9_.:-]{1,160}$/

export async function handlePeerDispatch(
  request: Request,
  deps: {
    serviceToken: string
    encryptionKey: string
    sockets: SocketRegistry
    dispatcher: Dispatcher
  },
): Promise<Response> {
  try {
    const { raw, body } = await readBody(request)
    if (!verifyPeerRequest(deps.serviceToken, raw, {
      timestamp: request.headers.get("x-cg-peer-timestamp"),
      nonce: request.headers.get("x-cg-peer-nonce"),
      signature: request.headers.get("x-cg-peer-signature"),
    })) {
      return peerJson({ ok: false, errorCode: "NOT_AUTHENTICATED" }, 401)
    }
    const deviceId = readId(body.deviceId)
    const sessionId = readSession(body.sessionId)
    const payloadCipher = readCipher(body.payloadCipher)
    const timeoutMs = readTimeout(body.timeoutMs)
    const socket = deps.sockets.get(deviceId)
    if (socket === undefined || socket.data.socketId !== sessionId || !socket.data.authenticated) {
      throw new GatewayError("DEVICE_OFFLINE", "The device session moved or disconnected.")
    }

    let jobValue: unknown
    try { jobValue = JSON.parse(await open(payloadCipher, deps.encryptionKey)) } catch {
      throw new GatewayError("INVALID_INPUT", "The peer job envelope is invalid.")
    }
    const job = parseSignedJob(jobValue)
    if (job.payload.expiresAt <= Date.now()) throw new GatewayError("TIMEOUT", "The peer job expired.")
    const result = await deps.dispatcher.dispatch(deviceId, job, timeoutMs)
    const resultCipher = await seal(JSON.stringify(result), deps.encryptionKey)
    return peerJson({ ok: true, resultCipher })
  } catch (cause) {
    const error = toGatewayError(cause)
    return peerJson({ ok: false, errorCode: error.code }, httpStatusFor(error.code))
  }
}

async function readBody(request: Request): Promise<{ raw: string; body: Record<string, unknown> }> {
  if ((request.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() !== "application/json") {
    throw new GatewayError("INVALID_INPUT", "The peer endpoint accepts JSON only.")
  }
  const declared = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declared) && declared > MAX_PEER_REQUEST_CHARS) throw tooLarge()
  const raw = await request.text()
  if (raw.length > MAX_PEER_REQUEST_CHARS) throw tooLarge()
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new GatewayError("INVALID_INPUT", "The peer request is invalid.") }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new GatewayError("INVALID_INPUT", "The peer request is invalid.")
  }
  return { raw, body: parsed as Record<string, unknown> }
}

function readId(value: unknown): string {
  if (typeof value !== "string" || !ID.test(value)) throw new GatewayError("INVALID_INPUT", "The peer device id is invalid.")
  return value
}
function readSession(value: unknown): string {
  if (typeof value !== "string" || !/^nce_[A-Za-z0-9_-]{16,96}$/.test(value)) throw new GatewayError("INVALID_INPUT", "The peer session is invalid.")
  return value
}
function readCipher(value: unknown): string {
  if (typeof value !== "string" || value.length > MAX_PEER_REQUEST_CHARS || !/^v1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]{22,}$/.test(value)) {
    throw new GatewayError("INVALID_INPUT", "The peer payload is invalid.")
  }
  return value
}
function readTimeout(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1 || value > 300_000) {
    throw new GatewayError("INVALID_INPUT", "The peer timeout is invalid.")
  }
  return value
}
function tooLarge(): GatewayError { return new GatewayError("INVALID_INPUT", "The peer request is too large.") }
function peerJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" },
  })
}
