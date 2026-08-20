/**
 * Cross-process contract lock. The gateway calls Convex by function reference
 * STRING; a rename on this side is invisible to `tsc` over there. This test is
 * the thing that fails when someone moves a file.
 */
import { describe, expect, test } from "vitest"
import { getFunctionName } from "convex/server"
import { api } from "./_generated/api"

const SERVICE_CONTRACT = {
  "service/devices:getRecord": api.service.devices.getRecord,
  "service/devices:listForUser": api.service.devices.listForUser,
  "service/devices:setPresence": api.service.devices.setPresence,
  "service/pairing:createChallenge": api.service.pairing.createChallenge,
  "service/pairing:getByCode": api.service.pairing.getByCode,
  "service/pairing:claim": api.service.pairing.claim,
  "service/approvals:claim": api.service.approvals.claim,
  "service/approvals:request": api.service.approvals.request,
  "service/policy:listRules": api.service.policy.listRules,
  "service/connections:listForUser": api.service.connections.listForUser,
  "service/connections:resolveCredential": api.service.connections.resolveCredential,
  "service/connections:beginRefresh": api.service.connections.beginRefresh,
  "service/connections:finishRefresh": api.service.connections.finishRefresh,
  "service/connections:abortRefresh": api.service.connections.abortRefresh,
  "service/gateway_lease:acquire": api.service.gateway_lease.acquire,
  "service/gateway_lease:renew": api.service.gateway_lease.renew,
  "service/gateway_lease:release": api.service.gateway_lease.release,
  "service/audit:append": api.service.audit.append,
  "service/apiKeys:getRecord": api.service.apiKeys.getRecord,
} as const

const FEATURE_CONTRACT = {
  "features/devices/queries:listMine": api.features.devices.queries.listMine,
  "features/devices/mutations:revoke": api.features.devices.mutations.revoke,
  "features/devices/mutations:rename": api.features.devices.mutations.rename,
  "features/pairing/queries:getByCode": api.features.pairing.queries.getByCode,
  "features/pairing/mutations:approve": api.features.pairing.mutations.approve,
  "features/audit/queries:listMine": api.features.audit.queries.listMine,
  "features/connections/queries:listMine": api.features.connections.queries.listMine,
  "features/approvals/queries:listPending": api.features.approvals.queries.listPending,
  "features/approvals/mutations:approve": api.features.approvals.mutations.approve,
  "features/approvals/mutations:deny": api.features.approvals.mutations.deny,
  "features/policy/queries:listMine": api.features.policy.queries.listMine,
  "features/policy/mutations:setRule": api.features.policy.mutations.setRule,
} as const

describe("pinned function references", () => {
  test.each(Object.entries(SERVICE_CONTRACT))("%s resolves", (expected, reference) => {
    expect(getFunctionName(reference)).toBe(expected)
  })

  test.each(Object.entries(FEATURE_CONTRACT))("%s resolves", (expected, reference) => {
    expect(getFunctionName(reference)).toBe(expected)
  })
})
