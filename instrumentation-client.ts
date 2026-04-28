// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

// Browser profiling needs the JS Self-Profiling API (window.Profiler).
// Available only on desktop Chromium (Chrome, Edge); absent on iOS Chrome
// (WebKit), Safari, Firefox. Sentry's integration is supposed to no-op
// when the API is missing, but we saw a "Maximum call stack size exceeded"
// on iOS Chrome 147 right after page load with this enabled, so guard it
// explicitly rather than rely on the SDK's internal feature detection.
const profilingSupported =
  typeof window !== "undefined" && "Profiler" in window;

const integrations = profilingSupported
  ? [Sentry.replayIntegration(), Sentry.browserProfilingIntegration()]
  : [Sentry.replayIntegration()];

Sentry.init({
  dsn: "https://d3c2a0943ee5884a02e7e194f97342c4@o4511259471052801.ingest.us.sentry.io/4511259471970304",

  integrations,

  // Define how likely traces are sampled. Adjust this value in production, or use tracesSampler for greater control.
  tracesSampleRate: 1,

  // Lower than 1.0 — every-session profiling produced a large amount of
  // overhead and correlated with the iOS Chrome crash above. 10% gives us
  // useful sampling without blanketing real users.
  profileSessionSampleRate: profilingSupported ? 0.1 : 0,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Define how likely Replay events are sampled.
  // This sets the sample rate to be 10%. You may want this to be 100% while
  // in development and sample at a lower rate in production
  replaysSessionSampleRate: 0.1,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
