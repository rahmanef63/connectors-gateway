import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TypeScript source, no build step.
  transpilePackages: [
    "@cg/core",
    // Server-side sealing of connection credentials (lib/credentials.ts).
    "@cg/auth",
    "@cg/adapter-remote-mcp",
    "@cg/adapter-blender",
    "@cg/schemas",
  ],
  reactStrictMode: true,
  // Standalone output for the Docker image. In a monorepo the tracing root has
  // to be the workspace root, or Next traces only apps/web and the image boots
  // without the hoisted node_modules.
  output: "standalone",
  outputFileTracingRoot: join(here, "../.."),
  // ponytail: Cache Components deliberately off — every screen here is authed
  // and dynamic (preloadQuery). Turn it on when a public marketing page lands.
}

export default nextConfig
