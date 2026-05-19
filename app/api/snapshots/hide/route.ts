// POST /api/snapshots/hide — append a snapshot id to its page's
// hidden_snapshot_ids. Page-level hide so the dismissal applies to every
// watcher AND the public /p/<id> share view, matching "delete = gone
// everywhere" user expectations.
//
// Auth: caller must be authenticated (anon Supabase JWT) and must already
// have a watch on the page that owns the snapshot. We do the actual write
// with the service-role client because RLS blocks anon writes to pages.

import { NextResponse } from "next/server";
import { createServiceClient } from "@/utils/supabase/service";
import { resolveUserFromAuthHeader } from "@/lib/auth";

export async function POST(req: Request) {
  let body: { snapshotId?: string };
  try {
    body = (await req.json()) as { snapshotId?: string };
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const snapshotId = body.snapshotId;
  if (!snapshotId || typeof snapshotId !== "string") {
    return NextResponse.json({ error: "snapshotId required" }, { status: 400 });
  }

  const user = await resolveUserFromAuthHeader(req.headers.get("authorization"));
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const svc = createServiceClient();
  const { data: snap } = await svc
    .from("snapshots")
    .select("page_id")
    .eq("id", snapshotId)
    .maybeSingle();
  if (!snap) {
    return NextResponse.json({ error: "snapshot not found" }, { status: 404 });
  }

  // Authorisation: only allow watchers of this page to hide its snapshots.
  // Without this any authenticated user could erase content from anyone's
  // share link.
  const { data: watchRow } = await svc
    .from("watches")
    .select("id")
    .eq("user_id", user.id)
    .eq("page_id", snap.page_id)
    .maybeSingle();
  if (!watchRow) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data: page } = await svc
    .from("pages")
    .select("hidden_snapshot_ids")
    .eq("id", snap.page_id)
    .maybeSingle();
  const current = (page?.hidden_snapshot_ids ?? []) as string[];
  if (current.includes(snapshotId)) {
    return NextResponse.json({ ok: true, alreadyHidden: true });
  }
  const next = Array.from(new Set([...current, snapshotId]));
  const { error } = await svc
    .from("pages")
    .update({ hidden_snapshot_ids: next })
    .eq("id", snap.page_id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
