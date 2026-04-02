import { NextResponse } from "next/server";
import FirecrawlApp from "@mendable/firecrawl-js";

const SCRAPE_TIMEOUT_MS = 300_000; // 5 minutes — Vercel free tier will still hard-kill at 10s in production

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { url } = body as { url?: string };

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  try {
    const firecrawl = new FirecrawlApp({
      apiKey: process.env.FIRECRAWL_API_KEY ?? "",
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      const id = setTimeout(() => reject(new Error("timeout")), SCRAPE_TIMEOUT_MS);
      id.unref(); // don't keep the Node event loop alive once the race resolves
    });
    const result = await Promise.race([
      firecrawl.scrape(url, {
        formats: ["markdown", "html", "rawHtml"],
        // mobile: true,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        actions: [{ type: "screenshot" as const, fullPage: true }] as any,
      }),
      timeoutPromise,
    ]);
    const actions = result.actions as { screenshots?: string[] } | undefined;
    const screenshot = actions?.screenshots?.[0] ?? null;
    console.log("[scrape]", url, result.markdown?.slice(0, 200));
    return NextResponse.json({
      markdown: result.markdown ?? "",
      html: result.html ?? "",
      rawHtml: result.rawHtml ?? "",
      screenshot,
    });
  } catch (err) {
    const detail =
      err && typeof err === "object"
        ? JSON.stringify((err as Record<string, unknown>).details ?? null)
        : null;
    const code =
      err && typeof err === "object"
        ? (err as Record<string, unknown>).code
        : null;
    const status =
      err && typeof err === "object"
        ? ((err as Record<string, unknown>).status as number | undefined)
        : undefined;
    console.error("[scrape] error", url, { code, status, detail });
    const message =
      err instanceof Error && err.message === "timeout"
        ? `scrape timed out after ${SCRAPE_TIMEOUT_MS / 1000}s — try again or use a simpler URL`
        : code === "BAD_REQUEST"
        ? `Firecrawl rejected this URL (${detail ?? "no details"})`
        : "failed to scrape url";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
