// The shell's public surface. Import from "@/components/shell", not from the
// files inside it — the internals (dock, sheet, topbar, nav rows) are AppShell's
// business and are free to move.
// PageHeader is deliberately NOT exported: AppShell mounts the one header, and
// a page that rendered a second would put two <h1>s on the screen.
export { AppShell } from "./app-shell"
