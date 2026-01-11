import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { markdown, watchTarget } = body as {
    markdown?: string;
    watchTarget?: string;
  };

  if (!markdown || !watchTarget) {
    return NextResponse.json(
      { error: "markdown and watchTarget are required" },
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
          content: `Given this web page content, extract the following as a short, precise value. Return only the value itself, no explanation, no punctuation at the end:\n\nWatch target: ${watchTarget}\n\nPage content:\n${markdown.slice(0, 8000)}`,
        },
      ],
    });

    const value =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    console.log("[extract]", watchTarget, "→", value);
    return NextResponse.json({ value });
  } catch (err) {
    console.error("[extract] error", err);
    return NextResponse.json({ error: "extraction failed" }, { status: 500 });
  }
}
