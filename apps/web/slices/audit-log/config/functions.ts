/**
 * The slice's single point of coupling to the control plane.
 * Function names are the pinned cross-process contract; if a consumer mounts
 * the Convex feature modules under different paths, this file is the only edit.
 */
import { api } from "@convex/_generated/api"

export const auditFunctions = {
  listMine: api.features.audit.queries.listMine,
} as const
