import type { FactChange } from "@/lib/facts";
import { parseJsonResponse } from "@/lib/parse-json-response";
import { createAnthropicClient } from "@/lib/anthropic";
import { startTrace } from "@/lib/observability";

export interface DescribeChangeInput {
  oldValue: string;
  newValue: string;
  watchTarget: string;
  // Distinct user-set watch targets for this page ("price of the Pro plan",
  // "app rating", "in-stock status"). When provided, the prompt asks Claude
  // to focus on whether any of those specific values moved rather than
  // describing the diff generally — a $40 price change in a noisy markdown
  // diff otherwise gets summarised as "no significant changes."
  watchTargets?: string[];
  // Free-form user notes refining what to track ("the price labeled
  // 'General Admission' under '## listings'; ignore JSON-LD aggregate
  // prices"). Treated as authoritative guidance in the prompt — Claude is
  // told to follow them over its own interpretation of the page.
  userNotes?: string[];
  url: string;
  // Optional structured-data diff (JSON-LD / meta). When present, the model
  // is told to prefer these precise facts over prose inferences — markdown
  // often rounds ("1.2k ratings") while the fact bag carries the real
  // numbers ("1217").
  factsDiff?: FactChange[];
  // Observability context. When set, the LLM call is wrapped in a trace so
  // user feedback later (swipe-dismiss, etc.) can be attached to the same
  // trace id. correlationId is the snapshot id we're about to persist —
  // using snapshot.id as the trace.id closes the UI ↔ telemetry loop
  // without needing a separate column.
  telemetry?: {
    correlationId?: string;
    userId?: string;
    extraMetadata?: Record<string, unknown>;
  };
}

export interface DescribeChangeResult {
  description: string;
  classification: "major" | "minor";
  emoji?: string;
}

// Core logic shared by /api/describe-change (public endpoint) and /api/scrape
// (server-to-server caller). Keeps us from hopping through HTTP inside the
// same serverless function.
export async function describeChange({
  oldValue,
  newValue,
  watchTarget,
  watchTargets,
  userNotes,
  url,
  factsDiff,
  telemetry,
}: DescribeChangeInput): Promise<DescribeChangeResult> {
  const client = createAnthropicClient();

  const factsBlock = formatFactsDiff(factsDiff);
  const targetsBlock = formatWatchTargets(watchTargets);
  const notesBlock = formatUserNotes(userNotes);
  const hasSpecificTargets = Boolean(targetsBlock);
  const hasUserNotes = Boolean(notesBlock);
  // Slice each markdown to ~8K chars. We previously sent 2K — Haiku-era
  // conservatism — but real pages (ticket marketplaces, product pages)
  // routinely push the meaningful content below the nav/menu fluff, so
  // a 2K window misses the actual price/rating Claude needs to find.
  // ~8K chars ≈ 2K tokens; the 4× bump costs ~$0.003/call on Haiku 4.5
  // and the 200K context window has plenty more headroom if we need it.
  const MARKDOWN_SLICE = 8000;
  const content =
    `A monitored web page changed. Everything you say in the description must be grounded in the visible page content below — that's what the user actually sees on the page.\n\n` +
    `URL: ${url}\n` +
    `Watch target: ${watchTarget}\n` +
    (targetsBlock ? `${targetsBlock}\n` : "") +
    (notesBlock ? `${notesBlock}\n` : "") +
    `Previous value (page content as the user sees it): ${oldValue.slice(0, MARKDOWN_SLICE)}\n` +
    `New value (page content as the user sees it): ${newValue.slice(0, MARKDOWN_SLICE)}\n` +
    (factsBlock ? `\n${factsBlock}\n` : "") +
    `\nReturn only a JSON object:\n` +
    `- "description": one plain-English sentence a non-technical user would understand, max 15 words, e.g. "The price dropped from $99 to $79." Ground every number/name in the visible page content above. Never frame the change as a "recovery", "restoration", "now accessible", or any narrative about returning from a broken/error/loading state — if the previous content looked partial or odd that's just the baseline. Describe what's now visible in concrete terms (e.g. "Rating shown as 4.5 with 1,217 reviews."), never narrate the transition (e.g. NOT "page recovered from error to show 4.5").${
      hasUserNotes
        ? ' The user refinement notes above are authoritative — follow them over your own interpretation of the page. If they tell you which section to read, read THAT section; if they tell you to ignore certain values, ignore them.'
        : ""
    }${
      hasSpecificTargets
        ? ' Focus on the user-specified properties; even small numeric moves count when they\'re in a tracked property. Lead with the exact before → after value from the visible content (e.g. "Price rose from $440 to $480."). If none of the user-specified properties changed in the visible content, say so directly ("Price unchanged at $440.") and set classification to "minor".'
        : ""
    }${
      factsBlock
        ? ' The background metadata is OPTIONAL precision context: only quote a metadata number when it corresponds to (and adds resolution to) a value already visible in the page content — e.g. the page says "2.5k reviews" and metadata shows reviewCount 2523 → 2548 → quote 2548. Never quote a metadata value that doesn\'t map to something the user can see; never let metadata override or contradict the visible content.'
        : ""
    }\n` +
    `- "classification": "major" if significant (pricing, people, features, availability)${
      hasSpecificTargets ? " — any change to a user-specified property is automatically major" : ""
    }, otherwise "minor"\n` +
    `- "emoji": one emoji that best captures the sentiment or nature of the change, e.g. 📈 improving/growing, 📉 declining/worsening, 💰 price change, 🚀 launch/release, 🛠️ maintenance/fix, ⚠️ warning/issue, 🎉 good news, 👤 people/personnel, 🔒 security, 📅 date/deadline`;

  const MODEL = "claude-haiku-4-5-20251001";
  // Open a Langfuse trace (no-ops if env vars absent). Using the caller's
  // correlationId — which the scrape route passes as the future snapshot.id
  // — means user-feedback scores collected via /api/snapshots/hide can be
  // attached to the same trace without a separate id mapping.
  const trace = startTrace({
    id: telemetry?.correlationId,
    name: "describeChange",
    userId: telemetry?.userId,
    metadata: {
      url,
      hasUserNotes,
      hasSpecificTargets,
      hasFacts: Boolean(factsBlock),
      watchTargetsCount: watchTargets?.length ?? 0,
      userNotesCount: userNotes?.length ?? 0,
      factsDiffSize: factsDiff?.length ?? 0,
      ...(telemetry?.extraMetadata ?? {}),
    },
  });
  const generation = trace.generation({
    name: "describe-change-call",
    model: MODEL,
    input: content,
  });

  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 256,
    messages: [{ role: "user", content }],
  });

  let description = "The monitored value changed.";
  let classification: "major" | "minor" = "minor";
  let emoji: string | undefined;
  const raw =
    message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
  generation.end({
    output: raw,
    usage: {
      input: message.usage?.input_tokens ?? 0,
      output: message.usage?.output_tokens ?? 0,
    },
  });
  const parsed = parseJsonResponse<{
    description?: string;
    classification?: string;
    emoji?: string;
  }>(raw);
  if (parsed) {
    if (typeof parsed.description === "string") description = parsed.description;
    if (parsed.classification === "major") classification = "major";
    if (typeof parsed.emoji === "string") emoji = parsed.emoji.trim();
  }
  // If parseJsonResponse returned null the description stays at the default
  // "The monitored value changed." — never leak a raw model dump (including
  // its commentary / fences / notes) into the change log.
  trace.end({ output: { description, classification, emoji, parseOk: Boolean(parsed) } });
  return { description, classification, emoji };
}

function formatWatchTargets(targets: string[] | undefined): string {
  if (!targets || targets.length === 0) return "";
  // De-dup + trim + cap. 20 is well above the realistic number of distinct
  // watchers per page; if we ever blow past that the prompt would balloon.
  const clean = Array.from(
    new Set(targets.map((t) => t.trim()).filter(Boolean)),
  ).slice(0, 20);
  if (clean.length === 0) return "";
  return `User-specified properties to monitor (focus the description on these — these are what users explicitly asked you to track):\n${clean.map((t) => `- "${t}"`).join("\n")}`;
}

function formatUserNotes(notes: string[] | undefined): string {
  if (!notes || notes.length === 0) return "";
  const clean = Array.from(
    new Set(notes.map((n) => n.trim()).filter(Boolean)),
  ).slice(0, 20);
  if (clean.length === 0) return "";
  return `User refinement notes (authoritative guidance from the user about what specifically to watch — follow these literally; they exist because the user already saw the AI get it wrong without them):\n${clean.map((n) => `- ${n}`).join("\n")}`;
}

function formatFactsDiff(changes: FactChange[] | undefined): string {
  if (!changes || changes.length === 0) return "";
  const lines = changes.slice(0, 20).map((c) => {
    if (c.before !== undefined && c.after !== undefined) {
      return `- ${c.key}: ${c.before} → ${c.after}`;
    }
    if (c.after !== undefined) return `- ${c.key}: (new) ${c.after}`;
    return `- ${c.key}: (removed, was ${c.before})`;
  });
  return `Background metadata — OPTIONAL precision hints from the page's JSON-LD / OG meta. Use ONLY when a value here adds resolution to something already visible in the page content (e.g. page says "2.5k" → metadata shows "2523"). Ignore any value that doesn't map to something visible:\n${lines.join("\n")}`;
}
