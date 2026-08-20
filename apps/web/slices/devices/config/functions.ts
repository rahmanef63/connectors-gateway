/**
 * The slice's single point of coupling to the control plane.
 * Function names are the pinned cross-process contract; if a consumer mounts
 * the Convex feature modules under different paths, this file is the only edit.
 */
import { api } from "@convex/_generated/api"

export const devicesFunctions = {
  listMine: api.features.devices.queries.listMine,
  revoke: api.features.devices.mutations.revoke,
  rename: api.features.devices.mutations.rename,
  forget: api.features.devices.mutations.forget,
} as const
