// Loading placeholder that mirrors the shape of the content it stands in for.
// Size it with width/height utilities at the call site.
//
// The animation and the surface live in one place — the `.skeleton` class in
// app/globals.css — so a skeleton can never drift from the theme.
//
// Decorative by definition: the surrounding block carries the announcement
// (`role="status"` + a name), each placeholder is `aria-hidden`.
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`skeleton ${className}`} />
}
