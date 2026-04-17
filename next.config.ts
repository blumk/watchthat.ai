import { withSentryConfig } from "@sentry/nextjs";
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

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "personal-llk",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: true,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  },
});
