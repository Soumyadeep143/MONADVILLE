import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (apps/web/.env) — copy apps/web/.env.example.");
}

// persistSession stays on (its default): this is a real multi-device,
// multiplayer login, so the session needs to survive a page reload the same
// way it would for any real web app. What used to live in our own
// hand-rolled localStorage keys (api.ts's old setSession/getToken) is gone —
// this is the only client-side session storage left, and it's Supabase's,
// not ours.
export const supabase = createClient(url, anonKey);
