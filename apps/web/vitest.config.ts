import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// convex-test executes Convex functions in the Convex runtime's shape, which
// is closest to edge-runtime; it must be inlined because it ships ESM that
// relies on `import.meta.glob` being transformed by vite.
//
// `environment` is the default only: every slice test carries a
// `// @vitest-environment node` docblock and overrides it per file.
export default defineConfig({
  // Mirrors the `paths` entries in tsconfig.json. `@/features/*` must be
  // listed before `@/*`, because vite applies the first matching alias.
  resolve: {
    alias: [
      { find: /^@\/features\/(.*)$/, replacement: here("./slices/$1") },
      { find: /^@convex\/(.*)$/, replacement: here("./convex/$1") },
      { find: /^@\/(.*)$/, replacement: here("./$1") },
    ],
  },
  test: {
    environment: "edge-runtime",
    include: [
      "convex/**/*.test.ts",
      "lib/**/*.test.ts",
      "slices/**/*.test.ts",
    ],
    server: {
      deps: {
        inline: ["convex-test"],
      },
    },
  },
})
