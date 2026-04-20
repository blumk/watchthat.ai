import { NextResponse } from "next/server";
import { describeChange } from "@/lib/describe-change";

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
    const result = await describeChange({ oldValue, newValue, watchTarget, url });
    console.log(
      "[describe-change]",
      watchTarget,
      ":",
      oldValue.slice(0, 80),
      "→",
      newValue.slice(0, 80),
      "|",
      result.classification,
      result.emoji,
      result.description,
    );
    return NextResponse.json(result);
  } catch (err) {
    console.error("[describe-change] error", err);
    return NextResponse.json({ error: "description failed" }, { status: 500 });
  }
}
