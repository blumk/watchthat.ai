import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { parseJsonResponse } from "@/lib/parse-json-response";
import { createAnthropicClient } from "@/lib/anthropic";

export async function POST(request: Request) {
  Sentry.setTag("route", "analyze");
  const body = await request.json().catch(() => ({}));
  const { markdown } = body as { markdown?: string };

  if (!markdown) {
    return NextResponse.json(
      { error: "markdown is required" },
      { status: 400 }
    );
  }
  Sentry.setTag("analyze.markdownLen", String(markdown.length));

  try {
    const client = createAnthropicClient();
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 512,
      messages: [
        {
          role: "user",
          content: `You are helping a user set up monitoring for a website.\n\nPage content (markdown):\n${markdown.slice(0, 6000)}\n\nBased solely on the page content above, return a JSON object with:\n- "siteType": a short 2-4 word label describing what this site is (e.g. "E-commerce product page", "News website", "Job listing", "Company about page")\n- "options": an array of exactly 2 specific, useful things to monitor on this site. Each must be an object {"label": "short human label (3-5 words)", "watchTarget": "precise description for AI extraction"}. Be concrete and specific to the actual content on this page. Good examples: {"label": "Pro plan price", "watchTarget": "the monthly price of the Pro plan"}, {"label": "Top news headline", "watchTarget": "the top breaking news headline"}, {"label": "CEO name", "watchTarget": "the name of the CEO or company leader"}\n\nReturn only the JSON object.`,
        },
      ],
    });

    const raw =
      message.content[0]?.type === "text" ? message.content[0].text.trim() : "";
    const parsed = parseJsonResponse<{
      siteType?: string;
      options?: Array<{ label: string; watchTarget: string }>;
    }>(raw);

    return NextResponse.json({
      siteType: typeof parsed?.siteType === "string" ? parsed.siteType : "Website",
      options: Array.isArray(parsed?.options) ? parsed.options.slice(0, 3) : [],
    });
  } catch (err) {
    console.error("[analyze] error", err);
    return NextResponse.json({ error: "analysis failed" }, { status: 500 });
  }
}
