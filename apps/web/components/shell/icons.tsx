// One inline SVG set — no icon dependency. Geometry lives in a lookup map, so
// adding an icon is one entry, never a new branch (and `IconName` keeps the nav
// registry honest: an unknown name will not typecheck).
//
// Every glyph is a 24x24 stroke drawing on `currentColor`, so colour comes from
// the surrounding text token and nothing here hardcodes a value.

/** A stroked path, or a circle as [cx, cy, r]. */
type Shape = { d: string } | { c: [number, number, number] }

const SHAPES = {
  laptop: [{ d: "M4 5h16v11H4z" }, { d: "M2 20h20" }],
  plug: [{ d: "M9 2v6" }, { d: "M15 2v6" }, { d: "M6 8h12v2a6 6 0 0 1-12 0z" }, { d: "M12 16v6" }],
  key: [{ c: [7.5, 16.5, 4] }, { d: "M10.5 13.5L21 3" }, { d: "M17.5 6.5l3 3" }],
  check: [{ d: "M20 6L9 17l-5-5" }],
  search: [{ c: [11, 11, 7] }, { d: "M20 20l-4-4" }],
  sparkle: [{ d: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" }],
  gear: [
    { c: [12, 12, 3.2] },
    { d: "M12 1.6v2.6" },
    { d: "M12 19.8v2.6" },
    { d: "M22.4 12h-2.6" },
    { d: "M4.2 12H1.6" },
    { d: "M19.3 4.7l-1.8 1.8" },
    { d: "M6.5 17.5l-1.8 1.8" },
    { d: "M19.3 19.3l-1.8-1.8" },
    { d: "M6.5 6.5L4.7 4.7" },
  ],
  more: [{ c: [5, 12, 1.4] }, { c: [12, 12, 1.4] }, { c: [19, 12, 1.4] }],
  /** Sidebar toggle in the topbar — a panel with its left rail split off. */
  "panel-left": [{ d: "M3 5h18v14H3z" }, { d: "M9 5v14" }],
  sun: [
    { c: [12, 12, 4] },
    { d: "M12 2v2.5" },
    { d: "M12 19.5V22" },
    { d: "M22 12h-2.5" },
    { d: "M4.5 12H2" },
    { d: "M19.1 4.9l-1.8 1.8" },
    { d: "M6.7 17.3l-1.8 1.8" },
    { d: "M19.1 19.1l-1.8-1.8" },
    { d: "M6.7 6.7L4.9 4.9" },
  ],
  moon: [{ d: "M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" }],
  monitor: [{ d: "M3 4h18v12H3z" }, { d: "M8 20h8" }, { d: "M12 16v4" }],
  user: [{ c: [12, 8, 4] }, { d: "M4 20a8 8 0 0 1 16 0" }],
  logout: [{ d: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" }, { d: "M10 17l5-5-5-5" }, { d: "M15 12H3" }],
  trash: [{ d: "M4 7h16" }, { d: "M9 7V5h6v2" }, { d: "M6 7l1 13h10l1-13" }],
  pencil: [{ d: "M4 20h4L20 8l-4-4L4 16z" }],
  copy: [{ d: "M9 9h11v11H9z" }, { d: "M5 15H4V4h11v1" }],
  shield: [{ d: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" }],
  clock: [{ c: [12, 12, 9] }, { d: "M12 7v5l3 2" }],
} as const satisfies Record<string, readonly Shape[]>

export type IconName = keyof typeof SHAPES

export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {SHAPES[name].map((shape, index) =>
        "d" in shape ? (
          <path key={index} d={shape.d} />
        ) : (
          <circle key={index} cx={shape.c[0]} cy={shape.c[1]} r={shape.c[2]} />
        ),
      )}
    </svg>
  )
}
