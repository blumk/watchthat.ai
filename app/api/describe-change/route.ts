import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { oldValue, newValue, watchTarget, url } = body as {
    oldValue?: string;
    newValue?: string;
    watchTarget?: string;
    url?: string;
  };

  if (!oldValue || !newValue || !watchTarget || !url) {
    return NextResponse.json(
      { error: "oldValue, newValue, watchTarget, and url are required" },
      { status: 400 }
    );
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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
    // Strip markdown code fences Claude sometimes wraps around JSON
    const text = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    try {
      const parsed = JSON.parse(text) as { description?: string; classification?: string; emoji?: string };
      if (typeof parsed.description === "string") description = parsed.description;
      if (parsed.classification === "major") classification = "major";
      if (typeof parsed.emoji === "string") emoji = parsed.emoji.trim();
    } catch {
      if (text) description = text;
    }
    console.log("[describe-change]", watchTarget, ":", oldValue, "→", newValue, "|", classification, emoji, description);
    return NextResponse.json({ description, classification, emoji });
  } catch (err) {
    console.error("[describe-change] error", err);
    return NextResponse.json(
      { error: "description failed" },
      { status: 500 }
    );
  }
}
