// Server-side validation of a Supabase anon-session bearer JWT. Used by
// route handlers that need to know who the caller is (to scope writes the
// service-role client will then perform on tables RLS blocks anon from
// writing directly).

import { createClient as createUserClient } from "@supabase/supabase-js";
import type { Database } from "@/utils/supabase/database.types";

export async function resolveUserFromAuthHeader(authHeader: string | null) {
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
