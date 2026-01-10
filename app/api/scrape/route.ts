import { NextResponse } from "next/server";
import FirecrawlApp from "@mendable/firecrawl-js";

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { url } = body as { url?: string };

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  try {
    const firecrawl = new FirecrawlApp({
      apiKey: process.env.FIRECRAWL_API_KEY ?? "",
    });
    const result = await firecrawl.scrape(url, {
      formats: ["markdown", "html", "rawHtml", "screenshot@fullPage"],
    });
    console.log("[scrape]", url, result.markdown?.slice(0, 200));
    return NextResponse.json({
      markdown: result.markdown ?? "",
      html: result.html ?? "",
      rawHtml: result.rawHtml ?? "",
      screenshot: result.screenshot ?? null,
    });
  } catch (err) {
    console.error("[scrape] error", url, err);
    return NextResponse.json(
      { error: "failed to scrape url" },
      { status: 500 }
    );
  }
}
