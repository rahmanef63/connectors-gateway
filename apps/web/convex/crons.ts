/**
 * Scheduled maintenance. One job today.
 *
 * Hourly rather than daily: an authorization code lives two minutes, so an
 * hourly pass keeps `oauthCodes` near-empty in normal operation, and the batch
 * bound means a busy hour simply spills into the next tick instead of trying to
 * catch up inside one transaction.
 */
import { cronJobs } from "convex/server"
import { internal } from "./_generated/api"

const crons = cronJobs()

crons.interval("sweep expired OAuth rows", { hours: 1 }, internal.maintenance.oauth_sweep.sweep, {})

export default crons
