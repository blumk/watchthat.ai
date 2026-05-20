// Single seam between the app and our LLM-observability vendor (currently
// Langfuse). Everything else calls into this module — if we ever swap to
// LangSmith / Phoenix / etc., only this file changes.
//
// Surface (intentionally generic, vendor-flavored names avoided):
//
//   startTrace({ id?, name, metadata, userId? })  → TraceHandle
//   trace.generation({ name, model, input })      → GenerationHandle
//   generation.end({ output, usage? })            → void
//   trace.end({ output })                         → void
//   recordScore({ traceId, name, value, comment? }) → void
//   flush()                                       → Promise<void>
//
// When the env vars below are absent the implementation returns no-op
// handles so call sites don't need to branch. Useful for local dev, tests,
// and the moment between provisioning Langfuse and setting the keys.
//
// Required env vars (production):
//   LANGFUSE_PUBLIC_KEY   — public ("pk-…") key, server-side only is fine
//   LANGFUSE_SECRET_KEY   — secret ("sk-…") key, server-only never client
//   LANGFUSE_BASE_URL     — optional override, defaults to us.cloud.langfuse.com

// Type-only import — the actual Langfuse module is `require()`d lazily
// inside `getClient()` because its constructor triggers a dynamic import
// at module load that crashes Jest's CJS runner. With this pattern, the
// SDK code is never loaded when LANGFUSE_* env vars are absent (i.e. in
// tests / local dev / before credentials are provisioned).
import type { Langfuse } from "langfuse";
import { after } from "next/server";

export interface TraceHandle {
  /**
   * Stable trace id. When the caller passed an explicit `id` to startTrace
   * this is that id; otherwise it's vendor-generated. Persist this if you
   * want to attach scores later (e.g. user feedback on the same operation).
   */
  id: string;
  generation: (input: GenerationInput) => GenerationHandle;
  end: (output: TraceEndPayload) => void;
}

export interface GenerationInput {
  /** Short identifier for the generation, e.g. "describe-change-call". */
  name: string;
  /** Exact model id sent to the API, e.g. "claude-haiku-4-5-20251001". */
  model: string;
  /** Whatever you'd want to see as the prompt on the vendor UI. */
  input: unknown;
}

export interface GenerationHandle {
  end: (payload: {
    output: unknown;
    usage?: { input: number; output: number };
  }) => void;
}

export interface TraceEndPayload {
  output?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ScoreInput {
  traceId: string;
  /** Short identifier, e.g. "user-dismissed", "thumbs-up". */
  name: string;
  /**
   * Numeric value. Conventions vary; Langfuse accepts any number. Suggest
   * +1 / -1 / 0 for binary signals, 0–1 for continuous.
   */
  value: number;
  /** Optional human-readable note attached to the score. */
  comment?: string;
}

// ── Implementation ─────────────────────────────────────────────────────

const NOOP_GENERATION: GenerationHandle = { end: () => {} };
const NOOP_TRACE: TraceHandle = {
  id: "",
  generation: () => NOOP_GENERATION,
  end: () => {},
};

let cachedClient: Langfuse | null | undefined;

function getClient(): Langfuse | null {
  if (cachedClient !== undefined) return cachedClient;
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  if (!publicKey || !secretKey) {
    cachedClient = null;
    return null;
  }
  // Lazy-require so the SDK never loads (and its module-init dynamic
  // import never fires) unless credentials are configured.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require("langfuse") as typeof import("langfuse");
  cachedClient = new mod.Langfuse({
    publicKey,
    secretKey,
    baseUrl: process.env.LANGFUSE_BASE_URL ?? "https://us.cloud.langfuse.com",
  });
  return cachedClient;
}

export function startTrace(opts: {
  id?: string;
  name: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}): TraceHandle {
  const client = getClient();
  if (!client) return NOOP_TRACE;
  const trace = client.trace({
    id: opts.id,
    name: opts.name,
    userId: opts.userId,
    metadata: opts.metadata,
  });
  return {
    id: trace.id,
    generation(input) {
      const gen = trace.generation({
        name: input.name,
        model: input.model,
        input: input.input,
      });
      return {
        end(payload) {
          gen.end({
            output: payload.output,
            usage: payload.usage
              ? { input: payload.usage.input, output: payload.usage.output }
              : undefined,
          });
        },
      };
    },
    end(payload) {
      trace.update({
        output: payload.output,
        metadata: payload.metadata,
      });
    },
  };
}

export function recordScore(input: ScoreInput): void {
  const client = getClient();
  if (!client) return;
  if (!input.traceId) return;
  client.score({
    traceId: input.traceId,
    name: input.name,
    value: input.value,
    comment: input.comment,
  });
}

/**
 * Drain the in-memory event buffer. MUST eventually run for every serverless
 * route handler that called startTrace / recordScore, otherwise the function
 * terminates before events are sent. No-op when Langfuse is disabled.
 *
 * Routes should prefer `scheduleFlush()` (below) which runs this after the
 * response is sent via Next.js's `after()`.
 */
export async function flush(): Promise<void> {
  if (!cachedClient) return;
  await cachedClient.flushAsync();
}

/**
 * Hook the Langfuse buffer drain to fire after the response is sent so the
 * Claude-call telemetry doesn't add latency to the user-facing request.
 * Safe to call from any server route — outside a real Next request scope
 * (e.g. unit tests directly invoking POST) it silently no-ops.
 */
export function scheduleFlush(): void {
  try {
    after(() => flush().catch(() => {}));
  } catch {
    // Called outside a Next.js request context — common in Jest tests.
    // The buffer drains on the next real request that does have a scope,
    // or when the process exits. Nothing actionable here.
  }
}

/**
 * Tests-only: reset the memoised client so test runs don't leak between
 * env-var configurations.
 */
export function _resetForTests(): void {
  cachedClient = undefined;
}
