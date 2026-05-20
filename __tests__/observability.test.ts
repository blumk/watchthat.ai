/** @jest-environment node */

// The abstraction's promise: when LANGFUSE_* env vars are absent it returns
// no-op handles, every entry point is safe to call, and nothing leaves the
// process. These tests validate that contract — they intentionally don't
// touch the Langfuse SDK with credentials.

import { startTrace, recordScore, flush, _resetForTests } from "@/lib/observability";

const PUBLIC = process.env.LANGFUSE_PUBLIC_KEY;
const SECRET = process.env.LANGFUSE_SECRET_KEY;

beforeEach(() => {
  delete process.env.LANGFUSE_PUBLIC_KEY;
  delete process.env.LANGFUSE_SECRET_KEY;
  _resetForTests();
});

afterAll(() => {
  if (PUBLIC) process.env.LANGFUSE_PUBLIC_KEY = PUBLIC;
  if (SECRET) process.env.LANGFUSE_SECRET_KEY = SECRET;
  _resetForTests();
});

describe("lib/observability (no-op path)", () => {
  it("startTrace returns a handle with empty id when keys are missing", () => {
    const trace = startTrace({ name: "test", metadata: { x: 1 } });
    expect(trace.id).toBe("");
    // No throws on use:
    const gen = trace.generation({ name: "g", model: "m", input: "in" });
    gen.end({ output: "out", usage: { input: 1, output: 2 } });
    trace.end({ output: { ok: true } });
  });

  it("recordScore no-ops when keys are missing", () => {
    expect(() =>
      recordScore({ traceId: "abc", name: "user-dismissed", value: -1 }),
    ).not.toThrow();
  });

  it("flush is awaitable and resolves when there's no client", async () => {
    await expect(flush()).resolves.toBeUndefined();
  });
});
