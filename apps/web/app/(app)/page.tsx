import { redirect } from "next/navigation"

import { DEFAULT_LANDING } from "@/lib/safe-redirect"

/** The dashboard root has no content of its own; Devices is the landing screen. */
export default function DashboardRoot() {
  redirect(DEFAULT_LANDING)
}
