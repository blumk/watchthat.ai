// POST /api/scrape — fetches a URL via Firecrawl and persists a snapshot.
//
// Behaviour:
//   - Upserts the shared `pages` row on first contact.
//   - 5-min URL-level dedup: if `last_fetched_at` is within the window, returns
//     the cached latest snapshot WITHOUT calling Firecrawl (`cached: true`).
//     Caps scrape frequency per URL across all users.
//   - Past the dedup window, Firecrawl runs and a new snapshot is ALWAYS
//     inserted — even when the markdown hash matches the previous one. This
//     keeps the screenshot fresh (markdown hash misses visual-only changes
//     like rotating banners) and makes `last_fetched_at` visibility match
//     reality. Claude's describe-change is skipped when the hash is unchanged
//     (saves tokens; classification defaults to "quiet").
//   - Page's `latest_snapshot_id` is updated to point at the new row.
//
// Response: `{ snapshot: SnapshotWithUrl, cached, newChange }`.

import { NextResponse } from "next/server";
import FirecrawlApp from "@mendable/firecrawl-js";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/utils/supabase/service";
import { normalizeUrl, extractLabel } from "@/lib/url";
import { sha256Hex } from "@/lib/sha256";
import { describeChange } from "@/lib/describe-change";
import { decorateSnapshot, type SnapshotRow } from "@/lib/snapshot";

const SCRAPE_TIMEOUT_MS = 300_000;
const DEDUP_WINDOW_MS = 300_000; // 5 minutes
const SCREENSHOTS_BUCKET = "screenshots";

type Svc = ReturnType<typeof createServiceClient>;

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { url: rawUrl, force } = body as { url?: string; force?: boolean };

  if (!rawUrl) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  // Reject non-http(s) schemes before normalization (which would otherwise
  // blindly prepend https:// and produce garbage).
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(rawUrl.trim());
  if (schemeMatch && !/^https?$/i.test(schemeMatch[1])) {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }
  let url: string;
  try {
    url = normalizeUrl(rawUrl);
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }
    if (!parsed.hostname.includes(".")) {
      return NextResponse.json({ error: "invalid url" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const svc = createServiceClient();

  // Ensure the shared pages row exists, then load it.
  const label = extractLabel(url);
  const { error: insertErr } = await svc
    .from("pages")
    .insert({ url, label })
    .select()
    .maybeSingle();
  if (insertErr && insertErr.code !== "23505") {
    return NextResponse.json(
      { error: `failed to upsert page: ${insertErr.message}` },
      { status: 500 },
    );
  }
  const { data: page, error: pageErr } = await svc
    .from("pages")
    .select("id, url, label, last_fetched_at, latest_snapshot_id")
    .eq("url", url)
    .single();
  if (pageErr || !page) {
    return NextResponse.json(
      { error: `failed to load page: ${pageErr?.message ?? "not found"}` },
      { status: 500 },
    );
  }

  // 5-min dedup short-circuit — caps scrape frequency per URL across users.
  if (!force && page.last_fetched_at && page.latest_snapshot_id) {
    const lastMs = new Date(page.last_fetched_at).getTime();
    if (Date.now() - lastMs < DEDUP_WINDOW_MS) {
      const cached = await loadSnapshot(svc, page.latest_snapshot_id);
      if (cached) {
        return NextResponse.json({
          snapshot: decorateSnapshot(cached),
          cached: true,
          newChange: false,
        });
      }
    }
  }

  // Firecrawl fetch.
  let markdown: string;
  let firecrawlScreenshot: string | null;
  try {
    const fetched = await runFirecrawl(url);
    markdown = fetched.markdown;
    firecrawlScreenshot = fetched.screenshot;
  } catch (err) {
    return firecrawlErrorResponse(url, err);
  }

  const contentHash = sha256Hex(markdown);

  // Compare against the previous snapshot so we can skip Claude when nothing
  // meaningful changed. We still insert a new snapshot either way (keeps the
  // screenshot fresh, gives `last_fetched_at` a real backing row).
  const prev = page.latest_snapshot_id
    ? await loadSnapshot(svc, page.latest_snapshot_id)
    : null;
  const hashChanged = !prev || prev.content_hash !== contentHash;

  const screenshotPath = firecrawlScreenshot
    ? await uploadScreenshot(svc, page.id, firecrawlScreenshot)
    : null;

  let description: string | null = null;
  let classification: "major" | "minor" | "quiet" = "quiet";
  let emoji: string | null = null;
  if (prev && hashChanged) {
    try {
      const desc = await describeChange({
        oldValue: prev.markdown,
        newValue: markdown,
        watchTarget: "page content",
        url,
      });
      description = desc.description;
      classification = desc.classification;
      emoji = desc.emoji ?? null;
    } catch (err) {
      console.error("[scrape] describe-change failed", err);
      description = "Page content changed.";
      classification = "minor";
    }
  }

  const { data: snapshot, error: snapErr } = await svc
    .from("snapshots")
    .insert({
      page_id: page.id,
      content_hash: contentHash,
      markdown,
      screenshot_path: screenshotPath,
      prev_snapshot_id: page.latest_snapshot_id ?? null,
      change_description: description,
      change_classification: classification,
      change_emoji: emoji,
    })
    .select()
    .single();
  if (snapErr || !snapshot) {
    return NextResponse.json(
      { error: `failed to insert snapshot: ${snapErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  await svc
    .from("pages")
    .update({
      latest_snapshot_id: snapshot.id,
      last_fetched_at: new Date().toISOString(),
    })
    .eq("id", page.id);

  return NextResponse.json({
    snapshot: decorateSnapshot(snapshot as SnapshotRow),
    cached: false,
    newChange: hashChanged && Boolean(page.latest_snapshot_id),
  });
}

async function runFirecrawl(
  url: string,
): Promise<{ markdown: string; screenshot: string | null }> {
  const firecrawl = new FirecrawlApp({
    apiKey: process.env.FIRECRAWL_API_KEY ?? "",
  });
  const timeoutPromise = new Promise<never>((_, reject) => {
    const id = setTimeout(() => reject(new Error("timeout")), SCRAPE_TIMEOUT_MS);
    id.unref();
  });
  const result = await Promise.race([
    firecrawl.scrape(url, {
      formats: ["markdown"],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actions: [{ type: "screenshot" as const, fullPage: true }] as any,
    }),
    timeoutPromise,
  ]);
  const actions = result.actions as { screenshots?: string[] } | undefined;
  return {
    markdown: result.markdown ?? "",
    screenshot: actions?.screenshots?.[0] ?? null,
  };
}

function firecrawlErrorResponse(url: string, err: unknown) {
  const detail =
    err && typeof err === "object"
      ? JSON.stringify((err as Record<string, unknown>).details ?? null)
      : null;
  const code =
    err && typeof err === "object"
      ? (err as Record<string, unknown>).code
      : null;
  console.error("[scrape] error", url, { code, detail });
  const message =
    err instanceof Error && err.message === "timeout"
      ? `scrape timed out after ${SCRAPE_TIMEOUT_MS / 1000}s`
      : code === "BAD_REQUEST"
      ? `Firecrawl rejected this URL (${detail ?? "no details"})`
      : "failed to scrape url";
  return NextResponse.json({ error: message }, { status: 500 });
}

async function loadSnapshot(svc: Svc, id: string): Promise<SnapshotRow | null> {
  const { data } = await svc.from("snapshots").select("*").eq("id", id).maybeSingle();
  return (data as SnapshotRow | null) ?? null;
}

async function uploadScreenshot(
  svc: Svc,
  pageId: string,
  sourceUrl: string,
): Promise<string | null> {
  try {
    let bytes: ArrayBuffer;
    if (sourceUrl.startsWith("data:")) {
      const base64 = sourceUrl.split(",")[1] ?? "";
      const buf = Buffer.from(base64, "base64");
      bytes = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    } else {
      const res = await fetch(sourceUrl);
      if (!res.ok) return null;
      bytes = await res.arrayBuffer();
    }
    const objectPath = `${pageId}/${randomUUID()}.png`;
    const { error } = await svc.storage
      .from(SCREENSHOTS_BUCKET)
      .upload(objectPath, bytes, { contentType: "image/png", upsert: true });
    if (error) {
      console.error("[scrape] screenshot upload failed", error.message);
      return null;
    }
    return objectPath;
  } catch (err) {
    console.error("[scrape] screenshot upload error", err);
    return null;
  }
}
