// Real accounts for multiplayer: the frontend signs in against Supabase
// directly (see apps/web/src/supabaseClient.ts) and sends the resulting
// access token as the bearer token; this verifies it server-side on every
// request via Supabase's own /auth/v1/user endpoint (supabase-js's
// auth.getUser(token)), which validates the JWT's signature and expiry
// against the project it was issued for — nothing here trusts the token's
// claims unchecked. displayName falls back through user_metadata (set at
// sign-up, see Login.tsx) then email, since Supabase doesn't require either.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthProvider, VerifiedIdentity } from "./AuthProvider.js";

export class SupabaseAuthProvider implements AuthProvider {
  private readonly client: SupabaseClient;

  constructor(url: string, anonKey: string) {
    if (!url || !anonKey) {
      throw new Error("AUTH_DRIVER=supabase requires SUPABASE_URL and SUPABASE_ANON_KEY to be set.");
    }
    this.client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async verifyToken(token: string): Promise<VerifiedIdentity | null> {
    const { data, error } = await this.client.auth.getUser(token);
    if (error || !data.user) return null;
    const displayName =
      (typeof data.user.user_metadata?.display_name === "string" && data.user.user_metadata.display_name) ||
      data.user.email ||
      data.user.id;
    return { authUserId: data.user.id, displayName };
  }
}
