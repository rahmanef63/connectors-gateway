import type { ReactNode } from "react"

/**
 * One titled block of a walk-through screen: the `.card` surface, an `<h2>` and
 * a lede. Shared by the server and client halves of a page so both halves are
 * the same shape — the shell owns the page `<h1>`, never a section.
 */
export function SectionCard({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      <div className="mt-5 space-y-5">{children}</div>
    </section>
  )
}
