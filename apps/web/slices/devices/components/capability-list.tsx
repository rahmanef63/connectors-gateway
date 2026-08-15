import { Badge } from "@/components/ui/badge"
import { groupCapabilities } from "../lib/capabilities"
import type { DevicesLabels } from "../types"

export type CapabilityListProps = {
  capabilities: readonly string[]
  labels: Pick<DevicesLabels, "capabilitiesTitle" | "capabilitiesEmpty" | "capabilitiesUngrouped">
}

/** What the agent announced, grouped by adapter namespace. */
export function CapabilityList({ capabilities, labels }: CapabilityListProps) {
  const groups = groupCapabilities(capabilities)

  return (
    <section className="space-y-2">
      <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {labels.capabilitiesTitle}
      </h4>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{labels.capabilitiesEmpty}</p>
      ) : (
        <ul className="space-y-2">
          {groups.map((group) => (
            <li key={group.connector ?? ""} className="flex flex-wrap items-center gap-1.5">
              <span className="text-sm font-medium">{group.connector ?? labels.capabilitiesUngrouped}</span>
              {group.capabilities.map((capability) => (
                <Badge key={capability} variant="outline">
                  {capability}
                </Badge>
              ))}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
