// Join conditional class names — the tiny clsx we don't add a dep for.
//
// This does NOT merge conflicting Tailwind utilities (no tailwind-merge). Write
// call sites so only one value can win per property — a ternary that yields the
// whole variant, not two overlapping fragments:
//   cn("rounded-xl px-3", active ? "bg-accent/12 text-foreground" : "text-muted-foreground")
export const cn = (...classes: (string | false | null | undefined)[]): string =>
  classes.filter(Boolean).join(" ")
