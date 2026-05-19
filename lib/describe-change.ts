import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import type { FactChange } from "@/lib/facts";

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
  url: string;
  // Optional structured-data diff (JSON-LD / meta). When present, the model
  // is told to prefer these precise facts over prose inferences — markdown
  // often rounds ("1.2k ratings") while the fact bag carries the real
  // numbers ("1217").
  factsDiff?: FactChange[];
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
  url,
  factsDiff,
}: DescribeChangeInput): Promise<DescribeChangeResult> {
  const client = Sentry.instrumentAnthropicAiClient(
    new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
    { recordInputs: true, recordOutputs: true },
  );

  const factsBlock = formatFactsDiff(factsDiff);
  const targetsBlock = formatWatchTargets(watchTargets);
  const hasSpecificTargets = Boolean(targetsBlock);
  // Slice each markdown to ~8K chars. We previously sent 2K — Haiku-era
  // conservatism — but real pages (ticket marketplaces, product pages)
  // routinely push the meaningful content below the nav/menu fluff, so
  // a 2K window misses the actual price/rating Claude needs to find.
  // ~8K chars ≈ 2K tokens; the 4× bump costs ~$0.003/call on Haiku 4.5
  // and the 200K context window has plenty more headroom if we need it.
  const MARKDOWN_SLICE = 8000;
  const content =
    `A monitored web page changed.\n\n` +
    `URL: ${url}\n` +
    `Watch target: ${watchTarget}\n` +
    (targetsBlock ? `${targetsBlock}\n` : "") +
    `Previous value: ${oldValue.slice(0, MARKDOWN_SLICE)}\n` +
    `New value: ${newValue.slice(0, MARKDOWN_SLICE)}\n` +
    (factsBlock ? `\n${factsBlock}\n` : "") +
    `\nReturn only a JSON object:\n` +
    `- "description": one plain-English sentence a non-technical user would understand, max 15 words, e.g. "The price dropped from $99 to $79."${
      hasSpecificTargets
        ? ' Look CAREFULLY for changes to the user-specified properties above; even small numeric moves (e.g. 440 → 480) count when they\'re in a tracked property. When you find one, lead with the exact before → after value (e.g. "Price rose from $440 to $480."). If none of the user-specified properties changed, say so directly — e.g. "Price unchanged at $440." — and set classification to "minor".'
        : factsBlock
        ? ' When the structured-data changes above include a concrete before→after, lead with that exact value (e.g. "Rating dropped from 4.5 to 4.4.").'
        : ""
    }\n` +
    `- "classification": "major" if significant (pricing, people, features, availability)${
      hasSpecificTargets ? " — any change to a user-specified property above is automatically major" : ""
    }, otherwise "minor"\n` +
    `- "emoji": one emoji that best captures the sentiment or nature of the change, e.g. 📈 improving/growing, 📉 declining/worsening, 💰 price change, 🚀 launch/release, 🛠️ maintenance/fix, ⚠️ warning/issue, 🎉 good news, 👤 people/personnel, 🔒 security, 📅 date/deadline`;

  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [{ role: "user", content }],
  });

  let description = "The monitored value changed.";
  let classification: "major" | "minor" = "minor";
  let emoji: string | undefined;
  const raw =
    message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
  const text = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    const parsed = JSON.parse(text) as {
      description?: string;
      classification?: string;
      emoji?: string;
    };
    if (typeof parsed.description === "string") description = parsed.description;
    if (parsed.classification === "major") classification = "major";
    if (typeof parsed.emoji === "string") emoji = parsed.emoji.trim();
  } catch {
    if (text) description = text;
  }
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

function formatFactsDiff(changes: FactChange[] | undefined): string {
  if (!changes || changes.length === 0) return "";
  const lines = changes.slice(0, 20).map((c) => {
    if (c.before !== undefined && c.after !== undefined) {
      return `- ${c.key}: ${c.before} → ${c.after}`;
    }
    if (c.after !== undefined) return `- ${c.key}: (new) ${c.after}`;
    return `- ${c.key}: (removed, was ${c.before})`;
  });
  return `Structured-data changes (trust these over prose):\n${lines.join("\n")}`;
}
