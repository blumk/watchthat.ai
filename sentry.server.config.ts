// This file configures the initialization of Sentry on the server.
// The config you add here will be used whenever the server handles a request.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// @sentry/profiling-node ships prebuilt native bindings per Node ABI. On
// unsupported Node versions (e.g. current-release Node before the profiler
// catches up) the require() throws. Skip profiling there rather than
// crash the whole server instrumentation hook.
type ProfilingModule = typeof import("@sentry/profiling-node");
type Integration = ReturnType<ProfilingModule["nodeProfilingIntegration"]>;

let profilingIntegration: Integration | null = null;
try {
  const mod = require("@sentry/profiling-node") as ProfilingModule;
  profilingIntegration = mod.nodeProfilingIntegration();
} catch {
  // native module missing — continue without profiling
}

Sentry.init({
  dsn: "https://d3c2a0943ee5884a02e7e194f97342c4@o4511259471052801.ingest.us.sentry.io/4511259471970304",

  // consoleLoggingIntegration routes console.error / console.warn into the
  // Sentry Logs explorer (requires enableLogs: true below). Without this,
  // backend `console.error("…")` calls never reach Sentry at all — they
  // only show up in Vercel function logs.
  integrations: [
    ...(profilingIntegration ? [profilingIntegration] : []),
    Sentry.consoleLoggingIntegration({ levels: ["error", "warn"] }),
  ],

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Profile sampling — profileLifecycle: 'trace' ties profiling to active spans.
  profileSessionSampleRate: 1.0,
  profileLifecycle: "trace",

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});
