import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@mendable/firecrawl-js", "@anthropic-ai/sdk"],
};

export default nextConfig;
