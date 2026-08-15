/**
 * Durable audit sink (docs/10-observability.md).
 *
 * The event is rebuilt field-by-field by `buildAuditEvent` before it is sent,
 * so a widened AuditEvent can never smuggle an input payload into storage.
 * An audit write must not fail a request that already succeeded — the failure
 * is logged loudly and swallowed, because the alternative is turning a
 * successful action into a 500 after the side effect already happened.
 */
import type { AuditEvent, AuditSink } from "@cg/core"
import { buildAuditEvent } from "@cg/observability"
import type { Logger } from "@cg/observability"
import type { ControlPlaneClient } from "./client"
import { REFS } from "./refs"

export function createAuditSink(client: ControlPlaneClient, logger: Logger): AuditSink {
  return {
    async append(event: AuditEvent): Promise<void> {
      const safe = buildAuditEvent(event)
      try {
        await client.mutation(REFS.auditAppend, { event: safe as unknown as Record<string, unknown> })
      } catch {
        logger.error("audit write failed", {
          requestId: safe.requestId,
          connectorId: safe.connectorId,
          actionId: safe.actionId,
          status: safe.status,
        })
      }
    },
  }
}
