"use client"

import { useState } from "react"
import { useMutation, usePreloadedQuery, type Preloaded } from "convex/react"
import { POLICY_DECISIONS, type PolicyDecision } from "@cg/core"
import { toast } from "sonner"

import { api } from "@convex/_generated/api"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const LABELS = new Map<PolicyDecision, string>([
  ["ALLOW", "Allow"],
  ["REQUIRE_APPROVAL", "Approve"],
  ["DENY", "Deny"],
])

function ruleKey(rule: { connectorId: string; actionId: string }): string {
  return `${rule.connectorId}::${rule.actionId}`
}

export function PermissionsTable({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.features.policy.queries.listMine>
}) {
  const rules = usePreloadedQuery(preloaded)
  const setRule = useMutation(api.features.policy.mutations.setRule)
  const [busyKey, setBusyKey] = useState<string | null>(null)

  async function onSelect(
    rule: { connectorId: string; actionId: string },
    decision: PolicyDecision,
  ) {
    setBusyKey(ruleKey(rule))
    try {
      await setRule({ connectorId: rule.connectorId, actionId: rule.actionId, decision })
      toast.success(`${rule.actionId} set to ${LABELS.get(decision) ?? decision}`)
    } catch {
      // The server decides; never echo its error text back into the page.
      toast.error("Could not update that rule.")
    } finally {
      setBusyKey(null)
    }
  }

  if (rules.length === 0) {
    return (
      <EmptyState
        title="No explicit rules"
        description="Every action is decided by its risk class today: R0 and R1 allow, R2 and R3 need approval, R4 is denied. A rule appears here once you override one — and the local agent's own allowlist still applies on top."
      />
    )
  }

  return (
    <Card className="py-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-4">Connector</TableHead>
            <TableHead>Action</TableHead>
            <TableHead className="pr-4 text-right">Decision</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rules.map((rule) => {
            const key = ruleKey(rule)
            return (
              <TableRow key={key}>
                <TableCell className="pl-4 font-medium">{rule.connectorId}</TableCell>
                <TableCell className="font-mono text-xs">{rule.actionId}</TableCell>
                <TableCell className="pr-4">
                  <div className="flex flex-wrap justify-end gap-1">
                    {POLICY_DECISIONS.map((decision) => (
                      <Button
                        key={decision}
                        size="sm"
                        variant={rule.decision === decision ? "default" : "outline"}
                        disabled={busyKey === key}
                        aria-pressed={rule.decision === decision}
                        onClick={() => onSelect(rule, decision)}
                      >
                        {LABELS.get(decision) ?? decision}
                      </Button>
                    ))}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </Card>
  )
}
