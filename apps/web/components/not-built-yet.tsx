/**
 * Honest placeholder. It says what the screen will be (`title`) and what stands
 * in the way (`blockedOn`), rather than faking a working surface with mock
 * rows. A visitor should be able to tell "nothing here yet" from "broken".
 */
export function NotBuiltYet({ title, blockedOn }: { title: string; blockedOn: string }) {
  return (
    <div className="card p-6">
      <p className="text-xs font-medium uppercase tracking-wide text-accent">Not built yet</p>
      <h2 className="mt-2 text-base font-semibold text-foreground">{title}</h2>
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Blocked on
      </p>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">{blockedOn}</p>
    </div>
  )
}
