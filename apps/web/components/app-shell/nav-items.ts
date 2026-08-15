/** The dashboard's navigation, in the order docs list the MVP screens. */
import {
  ClipboardCheck,
  KeyRound,
  Laptop,
  Plug,
  ScrollText,
  Settings2,
  type LucideIcon,
} from "lucide-react"

export type NavItem = {
  href: string
  label: string
  /** One line of "what is this screen for", shown on the page header. */
  description: string
  icon: LucideIcon
}

export const NAV_ITEMS: readonly NavItem[] = [
  {
    href: "/devices",
    label: "Devices",
    description: "Paired local machines, what they can do, and how to cut them off.",
    icon: Laptop,
  },
  {
    href: "/connections",
    label: "Connections",
    description: "Cloud services this account has authorised the gateway to call.",
    icon: Plug,
  },
  {
    href: "/permissions",
    label: "Permissions",
    description: "Per-action policy. The most restrictive decision always wins.",
    icon: KeyRound,
  },
  {
    href: "/approvals",
    label: "Approvals",
    description: "Actions held for a human decision before they run.",
    icon: ClipboardCheck,
  },
  {
    href: "/audit",
    label: "Audit",
    description: "Who ran what, where it executed, and how policy decided.",
    icon: ScrollText,
  },
  {
    href: "/setup",
    label: "Setup",
    description: "Copy-ready configuration for connecting an AI client.",
    icon: Settings2,
  },
]

export function navItemFor(href: string): NavItem | undefined {
  return NAV_ITEMS.find((item) => item.href === href)
}
