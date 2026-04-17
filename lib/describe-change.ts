import Anthropic from "@anthropic-ai/sdk";
import * as Sentry from "@sentry/nextjs";

export interface DescribeChangeInput {
  oldValue: string;
  newValue: string;
  watchTarget: string;
  url: string;
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
}: DescribeChangeInput): Promise<DescribeChangeResult> {
  const client = Sentry.instrumentAnthropicAiClient(
    new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
    { recordInputs: true, recordOutputs: true },
  );
  const message = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 256,
    messages: [
      {
        role: "user",
        content: `A monitored web page changed.\n\nURL: ${url}\nWatch target: ${watchTarget}\nPrevious value: ${oldValue.slice(0, 2000)}\nNew value: ${newValue.slice(0, 2000)}\n\nReturn only a JSON object:\n- "description": one plain-English sentence a non-technical user would understand, max 15 words, e.g. "The price dropped from $99 to $79."\n- "classification": "major" if significant (pricing, people, features, availability), otherwise "minor"\n- "emoji": one emoji that best captures the sentiment or nature of the change, e.g. 📈 improving/growing, 📉 declining/worsening, 💰 price change, 🚀 launch/release, 🛠️ maintenance/fix, ⚠️ warning/issue, 🎉 good news, 👤 people/personnel, 🔒 security, 📅 date/deadline`,
      },
    ],
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
