import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Privileged server-to-server client. Bypasses RLS — use only in API routes
// to write to shared tables (pages, snapshots) and the screenshots bucket.
// NEVER import this from code that runs in the browser.
let cached: ReturnType<typeof createSupabaseClient<Database>> | null = null;

export const createServiceClient = () => {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !secret) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY — set both in .env.local",
    );
  }
  cached = createSupabaseClient<Database>(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
};
