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
      max_tokens: 128,
      messages: [
        {
          role: "user",
          content: `A monitored web page changed.\n\nURL: ${url}\nWatch target: ${watchTarget}\nPrevious value: ${oldValue}\nNew value: ${newValue}\n\nWrite exactly one concise sentence describing what changed. Be specific about the values.`,
        },
      ],
    });

    const description =
      message.content[0]?.type === "text"
        ? message.content[0].text.trim()
        : "The monitored value changed.";
    console.log("[describe-change]", watchTarget, ":", oldValue, "→", newValue, "|", description);
    return NextResponse.json({ description });
  } catch (err) {
    console.error("[describe-change] error", err);
    return NextResponse.json(
      { error: "description failed" },
      { status: 500 }
    );
  }
}
