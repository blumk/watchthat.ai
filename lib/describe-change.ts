import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";
import type { FactChange } from "@/lib/facts";

export interface DescribeChangeInput {
  oldValue: string;
  newValue: string;
  watchTarget: string;
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
  url,
  factsDiff,
}: DescribeChangeInput): Promise<DescribeChangeResult> {
  const client = Sentry.instrumentAnthropicAiClient(
    new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
    { recordInputs: true, recordOutputs: true },
  );

  const factsBlock = formatFactsDiff(factsDiff);
  const content =
    `A monitored web page changed.\n\n` +
    `URL: ${url}\n` +
    `Watch target: ${watchTarget}\n` +
    `Previous value: ${oldValue.slice(0, 2000)}\n` +
    `New value: ${newValue.slice(0, 2000)}\n` +
    (factsBlock ? `\n${factsBlock}\n` : "") +
    `\nReturn only a JSON object:\n` +
    `- "description": one plain-English sentence a non-technical user would understand, max 15 words, e.g. "The price dropped from $99 to $79."${
      factsBlock
        ? ' When the structured-data changes above include a concrete before→after, lead with that exact value (e.g. "Rating dropped from 4.5 to 4.4.").'
        : ""
    }\n` +
    `- "classification": "major" if significant (pricing, people, features, availability), otherwise "minor"\n` +
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
