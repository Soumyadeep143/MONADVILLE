import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/** Service-role client — bypasses RLS by design (see migration comments in docs/database.md's Supabase table). */
export function getSupabaseAdminClient(url: string, serviceRoleKey: string): SupabaseClient {
  if (!client) {
    client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
