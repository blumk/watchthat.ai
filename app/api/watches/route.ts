// POST /api/watches — server-side create path for a watch.
//   - Verifies the caller's anon session via Authorization: Bearer <jwt>.
//   - Upserts the shared `pages` row (service-role write — pages RLS blocks anon).
//   - Inserts a `watches` row for the caller (idempotent on (user_id, page_id)).
// Phase 3 will extend this to trigger scraping + snapshot persistence.

import { NextResponse } from "next/server";
import { createClient as createUserClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/utils/supabase/service";
import type { Database } from "@/utils/supabase/database.types";
import { normalizeUrl, extractLabel } from "@/lib/url";

export async function POST(req: Request) {
  let body: { url?: string; watchTarget?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!body.url || typeof body.url !== "string") {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  let url: string;
  try {
    url = normalizeUrl(body.url);
  } catch {
    return NextResponse.json({ error: "invalid url" }, { status: 400 });
  }

  const user = await resolveUser(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const svc = createServiceClient();

  // Upsert page. ON CONFLICT (url) DO NOTHING, then select.
  const label = extractLabel(url);
  const { error: insertErr } = await svc
    .from("pages")
    .insert({ url, label })
    .select()
    .maybeSingle();
  // 23505 is unique_violation — harmless here, means the row already exists.
  if (insertErr && insertErr.code !== "23505") {
    return NextResponse.json(
      { error: `failed to upsert page: ${insertErr.message}` },
      { status: 500 },
    );
  }
  const { data: page, error: selectErr } = await svc
    .from("pages")
    .select("id, url, label")
    .eq("url", url)
    .single();
  if (selectErr || !page) {
    return NextResponse.json(
      { error: `failed to load page: ${selectErr?.message ?? "not found"}` },
      { status: 500 },
    );
  }

  // Upsert watch.
  const { data: watch, error: watchErr } = await svc
    .from("watches")
    .upsert(
      {
        user_id: user.id,
        page_id: page.id,
        watch_target: body.watchTarget ?? null,
      },
      { onConflict: "user_id,page_id" },
    )
    .select("id, watch_target")
    .single();
  if (watchErr || !watch) {
    return NextResponse.json(
      { error: `failed to upsert watch: ${watchErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ watch, page });
}

async function resolveUser(authHeader: string | null) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice("Bearer ".length);
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return null;
  const client = createUserClient<Database>(supabaseUrl, supabaseKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}
