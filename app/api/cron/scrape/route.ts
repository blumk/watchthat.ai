// POST /api/cron/scrape — internal endpoint hit by Supabase pg_cron via
// pg_net for each due page. Auth via CRON_SECRET (must match the
// app.cron_secret database setting that the cron job reads). The endpoint
// looks up the page's URL and delegates to /api/scrape so we stay on the
// existing hash / fact-extract / describe-change pipeline instead of
// forking it.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";

// Same upper bound as the manual scrape — Firecrawl + Claude can chew up
// several seconds and we already run on Vercel Pro.
export const maxDuration = 300;

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET;
  // Accept the secret via either X-Cron-Secret OR Authorization: Bearer.
  // X-Cron-Secret is the primary path — supabase-ssr's middleware was
  // consuming the Authorization header looking for a Supabase JWT before
  // our route ever ran. A custom header doesn't look like a JWT so nothing
  // in the middleware chain has any reason to touch it.
  const customHeader = req.headers.get("x-cron-secret");
  const auth = req.headers.get("authorization");
  const bearerToken = auth?.startsWith("Bearer ")
    ? auth.slice("Bearer ".length)
    : null;
  const authorized =
    !!expected &&
    ((customHeader !== null && customHeader === expected) ||
      (bearerToken !== null && bearerToken === expected));

  if (!authorized) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { pageId?: string };
  try {
    body = (await req.json()) as { pageId?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const pageId = body.pageId;
  if (!pageId || typeof pageId !== "string") {
    return NextResponse.json({ error: "pageId required" }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data: page } = await svc
    .from("pages")
    .select("id, url")
    .eq("id", pageId)
    .maybeSingle();
  if (!page) {
    // Page deleted between cron claim and our run — nothing to do.
    return NextResponse.json({ error: "page not found" }, { status: 404 });
  }

  // Delegate to /api/scrape. The 5-minute dedup window is irrelevant here
  // because pages reach this endpoint only after their next_due_at elapsed
  // (≥1h since the last scrape), so we don't need force=true.
  const baseUrl = inferBaseUrl(req);
  const scrapeRes = await fetch(`${baseUrl}/api/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      // /api/scrape reads this to set a Sentry tag (scrape.source = "cron")
      // so AI calls produced by background polling are filterable.
      "x-source": "cron",
    },
    body: JSON.stringify({ url: page.url }),
  });
  const scrapeJson = (await scrapeRes
    .json()
    .catch(() => ({}))) as { cached?: boolean; newChange?: boolean };

  return NextResponse.json({
    pageId,
    status: scrapeRes.status,
    cached: scrapeJson.cached ?? null,
    newChange: scrapeJson.newChange ?? null,
  });
}

function inferBaseUrl(req: Request): string {
  // Prefer an explicit env override so dev/preview deployments don't
  // accidentally loop back to prod. Fall back to the request's own origin.
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return new URL(req.url).origin;
}
