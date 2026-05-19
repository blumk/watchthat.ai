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
//   - Hash-equal inserts store `markdown = NULL` — the text would be a
//     byte-for-byte duplicate of an earlier row, so readers resolve it from
//     the earliest snapshot with the same (page_id, content_hash).
//   - Firecrawl also returns raw HTML; we extract a safelisted projection
//     of JSON-LD + OpenGraph/Twitter meta into a "fact bag" (see lib/facts).
//     The content hash is over `markdown + "\n--\n" + factsBlob` so
//     structured changes (rating 4.5 → 4.4, review count 1217 → 1243) flip
//     the hash even when the rendered markdown rounds them away. The bag
//     is also diffed against the previous snapshot's bag and passed to
//     describeChange so the prose can quote exact before→after numbers.
//   - Page's `latest_snapshot_id` is updated to point at the new row.
//
// Response: `{ snapshot: SnapshotWithUrl, cached, newChange }`.

import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createServiceClient } from "@/utils/supabase/service";
import { normalizeUrl, extractLabel } from "@/lib/url";
import { sha256Hex } from "@/lib/sha256";
import { describeChange } from "@/lib/describe-change";
import { decorateSnapshot, type SnapshotRow } from "@/lib/snapshot";
import { extractFacts, diffFacts, factsBlob, type FactBag, type FactChange } from "@/lib/facts";
import { matchTargetToFact } from "@/lib/watch-target-match";
import { runFirecrawl, FIRECRAWL_TIMEOUT_MS } from "@/lib/firecrawl";

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
  let rawHtml: string;
  let firecrawlScreenshot: string | null;
  try {
    const fetched = await runFirecrawl(url);
    markdown = fetched.markdown;
    rawHtml = fetched.rawHtml;
    firecrawlScreenshot = fetched.screenshot;
  } catch (err) {
    return firecrawlErrorResponse(url, err);
  }

  const facts = extractFacts(rawHtml);
  const hasFacts = Object.keys(facts).length > 0;
  // Fold the fact bag into the content hash. Raw HTML itself is hopeless to
  // hash (nonces, ad tags, timestamps), but the canonicalized bag is a
  // narrow, safelisted projection — so 4.5 → 4.4 or 1217 → 1243 flips the
  // hash while incidental HTML churn doesn't.
  const contentHash = sha256Hex(markdown + "\n--\n" + factsBlob(facts));

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
    // prev.markdown is NULL whenever the previous snapshot was itself a
    // hash-equal re-insert. Resolve it via the earliest row carrying the same
    // (page_id, content_hash).
    const oldValue =
      prev.markdown ?? (await resolveMarkdown(svc, prev.page_id, prev.content_hash));
    const prevMarkdown = oldValue ?? "";
    const markdownChanged = prevMarkdown !== markdown;
    const prevHadFacts = prev.facts !== null;

    // Cold-start of the fact-extraction feature: the previous snapshot
    // predates extraction (prev.facts === null), so any "fact diff" would
    // just be our system newly noticing structured data that was always
    // there. If the markdown also hasn't moved, treat as quiet — the hash
    // only flipped because the recipe now includes factsBlob. If markdown
    // DID change, describe the markdown diff without a facts section.
    const coldStart = !prevHadFacts;
    if (coldStart && !markdownChanged) {
      // No real change; leave description/classification/emoji at quiet defaults.
    } else {
      const factsDiff = prevHadFacts
        ? diffFacts(prev.facts as FactBag, facts)
        : [];
      // Pull distinct user-specified watch targets + free-form notes for
      // this page. When users asked us to track a specific property ("price
      // of the Pro plan", "app rating"), Claude needs to know — otherwise
      // a buried numeric move in a noisy diff gets summarised as "nothing
      // changed." Notes are authoritative guidance the user added after
      // the AI got things wrong without them.
      const { watchTargets, userNotes } = await loadWatchHints(svc, page.id);
      // Filter the fact diff to only the keys the user's watch targets
      // actually resolve to. Otherwise the prompt's "trust structured data
      // over prose" instruction makes Claude faithfully report e.g.
      // Product.offers.lowPrice (a marketplace-wide floor price) when the
      // user only cares about "General Admission ticket price" — values
      // that look authoritative but answer the wrong question.
      const relevantFactsDiff = filterFactsDiffByTargets(
        factsDiff,
        watchTargets,
        facts,
      );
      try {
        const desc = await describeChange({
          oldValue: prevMarkdown,
          newValue: markdown,
          watchTarget: "page content",
          watchTargets,
          userNotes,
          url,
          factsDiff: relevantFactsDiff,
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
  }

  const { data: snapshot, error: snapErr } = await svc
    .from("snapshots")
    .insert({
      page_id: page.id,
      content_hash: contentHash,
      // Skip re-storing identical markdown on hash-equal re-fetches.
      markdown: hashChanged ? markdown : null,
      screenshot_path: screenshotPath,
      prev_snapshot_id: page.latest_snapshot_id ?? null,
      change_description: description,
      change_classification: classification,
      change_emoji: emoji,
      facts: hasFacts ? (facts as unknown as FactBag) : null,
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
    // A hash flip driven purely by our fact-extraction cold-start leaves
    // classification="quiet" and description=null — don't surface that as a
    // user-facing change event. Real changes produce a description.
    newChange:
      hashChanged &&
      Boolean(page.latest_snapshot_id) &&
      classification !== "quiet",
  });
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
      ? `scrape timed out after ${FIRECRAWL_TIMEOUT_MS / 1000}s`
      : code === "BAD_REQUEST"
      ? `Firecrawl rejected this URL (${detail ?? "no details"})`
      : "failed to scrape url";
  return NextResponse.json({ error: message }, { status: 500 });
}

async function loadSnapshot(svc: Svc, id: string): Promise<SnapshotRow | null> {
  const { data } = await svc.from("snapshots").select("*").eq("id", id).maybeSingle();
  return (data as SnapshotRow | null) ?? null;
}

// When users gave specific watch targets, drop fact-diff entries whose
// keys don't resolve from any of those targets via matchTargetToFact —
// the structured-data prompt block is otherwise dangerously authoritative
// for irrelevant signals (e.g. a marketplace `offers.lowPrice` showing up
// as a "price change" when the user wanted a specific section's price).
//
// Empty watchTargets means there are no user-specified properties at all,
// so we leave the full diff in place (factsDiff is then just generic
// context for whoever happens to be watching).
function filterFactsDiffByTargets(
  factsDiff: FactChange[],
  watchTargets: string[],
  facts: FactBag,
): FactChange[] {
  if (watchTargets.length === 0 || factsDiff.length === 0) return factsDiff;
  const relevant = new Set<string>();
  for (const target of watchTargets) {
    const match = matchTargetToFact(target, facts);
    if (match) relevant.add(match.key);
  }
  if (relevant.size === 0) return [];
  return factsDiff.filter((c) => relevant.has(c.key));
}

// Distinct non-null watch_target strings + target_notes refinements across
// every user watching this page. Both feed describeChange — targets focus
// the description; notes are authoritative guidance the user added after
// the AI got the page wrong without them.
async function loadWatchHints(
  svc: Svc,
  pageId: string,
): Promise<{ watchTargets: string[]; userNotes: string[] }> {
  const { data } = await svc
    .from("watches")
    .select("watch_target, target_notes")
    .eq("page_id", pageId);
  const rows = (data ?? []) as Array<{
    watch_target: string | null;
    target_notes: string | null;
  }>;
  const dedup = (vals: Array<string | null | undefined>): string[] =>
    Array.from(
      new Set(
        vals.map((v) => v?.trim()).filter((v): v is string => !!v),
      ),
    );
  return {
    watchTargets: dedup(rows.map((r) => r.watch_target)),
    userNotes: dedup(rows.map((r) => r.target_notes)),
  };
}

// Fallback markdown resolver for hash-equal re-inserts. We store
// markdown=null on dup rows, so when describe-change needs the previous text
// we look up the earliest snapshot with the same (page_id, content_hash) that
// still carries the actual markdown.
async function resolveMarkdown(
  svc: Svc,
  pageId: string,
  contentHash: string,
): Promise<string | null> {
  const { data } = await svc
    .from("snapshots")
    .select("markdown, fetched_at")
    .eq("page_id", pageId)
    .eq("content_hash", contentHash)
    .order("fetched_at", { ascending: true });
  const rows = (data ?? []) as Array<{ markdown: string | null }>;
  for (const row of rows) {
    if (row.markdown !== null) return row.markdown;
  }
  return null;
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
