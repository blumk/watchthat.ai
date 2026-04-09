import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
