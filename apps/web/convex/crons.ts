/**
 * Scheduled bounded maintenance.
 *
 * Hourly keeps two-minute authorization codes and ten-minute approval rows near
 * empty without making correctness depend on a cleanup schedule. Every pass is
 * capped, so a backlog spills into the next tick instead of becoming an outage.
 */
import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

crons.interval(
  "sweep expired transient rows",
  { hours: 1 },
  internal.maintenance.oauth_sweep.sweep,
  {},
)

export default crons
