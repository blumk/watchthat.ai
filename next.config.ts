import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Use a separate output dir for production builds so `next build` (run by the
  // pre-push hook) never touches the dev server's .next directory.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  serverExternalPackages: ["@mendable/firecrawl-js", "@anthropic-ai/sdk"],
  webpack(config, { dev, isServer }) {
    if (dev && !isServer) {
      // Stable chunk/module IDs in dev prevent stale-reference errors after server restarts.
      // Next.js defaults to 'named' (file-path-based) in dev, which changes when files are
      // added/removed. 'deterministic' uses a content hash — same code = same IDs.
      config.optimization.moduleIds = "deterministic";
      config.optimization.chunkIds = "deterministic";
    }
    return config;
  },
};

export default nextConfig;
