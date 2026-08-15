/** @type {import('next').NextConfig} */
const nextConfig = {
  // Workspace packages ship TypeScript source, no build step.
  transpilePackages: ["@cg/core"],
  reactStrictMode: true,
  // ponytail: Cache Components deliberately off — every screen here is authed
  // and dynamic (preloadQuery). Turn it on when a public marketing page lands.
}

export default nextConfig
