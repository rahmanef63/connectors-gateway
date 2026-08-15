"use client"

import { useState } from "react"
import { useMutation, usePreloadedQuery, type Preloaded } from "convex/react"
import { POLICY_DECISIONS, type PolicyDecision } from "@cg/core"

import { api } from "@convex/_generated/api"
import { EmptyState } from "@/components/empty-state"
import { useToast } from "@/components/toast"
import { cn } from "@/lib/cn"

const LABELS: Readonly<Record<PolicyDecision, string>> = Object.freeze({
  ALLOW: "Allow",
  REQUIRE_APPROVAL: "Approve",
  DENY: "Deny",
})

type Rule = { connectorId: string; actionId: string }

const ruleKey = (rule: Rule): string => `${rule.connectorId}::${rule.actionId}`

// Keyed by the @cg/core union, so a new decision value fails to typecheck here
// rather than rendering a raw protocol constant at a user.
const decisionLabel = (decision: PolicyDecision): string => LABELS[decision]

/**
 * Native `<table>` + a native toggle group on tokens. Metrics match
 * components/table-skeleton.tsx so the loading shape does not jump.
 */
export function PermissionsTable({
  preloaded,
}: {
  preloaded: Preloaded<typeof api.features.policy.queries.listMine>
}) {
  const rules = usePreloadedQuery(preloaded)
  const setRule = useMutation(api.features.policy.mutations.setRule)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const { toast } = useToast()

  async function onSelect(rule: Rule, decision: PolicyDecision) {
    const key = ruleKey(rule)
    // The buttons stay focusable while in flight (aria-disabled, not disabled),
    // so the re-entry guard lives here.
    if (busyKey !== null) return
    setBusyKey(key)
    try {
      await setRule({ connectorId: rule.connectorId, actionId: rule.actionId, decision })
      toast(`${rule.actionId} set to ${decisionLabel(decision)}`, { tone: "success" })
    } catch {
      // The server decides; never echo its error text back into the page — it
      // can name internal state.
      toast("Could not update that rule.", { tone: "danger" })
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
    <div className="card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Per-action policy rules for this account</caption>
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">
                Connector
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                Action
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                Decision
              </th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => {
              const key = ruleKey(rule)
              const busy = busyKey === key
              return (
                <tr key={key} className="border-b border-border last:border-b-0">
                  <th scope="row" className="px-4 py-3.5 text-left font-medium">
                    {rule.connectorId}
                  </th>
                  <td className="px-4 py-3.5 font-mono text-xs text-muted-foreground">
                    {rule.actionId}
                  </td>
                  <td className="px-4 py-3.5">
                    <div
                      role="group"
                      aria-label={`Decision for ${rule.actionId} on ${rule.connectorId}`}
                      className="flex flex-wrap justify-end gap-1"
                    >
                      {POLICY_DECISIONS.map((decision) => {
                        const active = rule.decision === decision
                        return (
                          <button
                            key={decision}
                            type="button"
                            aria-pressed={active}
                            aria-disabled={busy}
                            aria-label={`Set ${rule.actionId} to ${decisionLabel(decision)}`}
                            onClick={() => onSelect(rule, decision)}
                            className={cn(
                              "rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors aria-disabled:opacity-50",
                              active
                                ? "border-accent bg-accent/12 text-foreground"
                                : "border-border text-muted-foreground hover:border-border-hover hover:text-foreground",
                            )}
                          >
                            {decisionLabel(decision)}
                          </button>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
