// STUB — implement real Supabase JWT verification here (verify against
// SUPABASE_URL/SUPABASE_ANON_KEY, e.g. via `jose` + Supabase's JWKS
// endpoint, or the supabase-js admin client). Same AuthProvider interface as
// DevAuthProvider — flip AUTH_DRIVER=supabase in .env once this is real.

import type { AuthProvider, VerifiedIdentity } from "./AuthProvider.js";

export class SupabaseAuthProvider implements AuthProvider {
  constructor(_url: string, _anonKey: string) {}

  async verifyToken(_token: string): Promise<VerifiedIdentity | null> {
    throw new Error(
      "Supabase auth driver not implemented yet. See apps/server/src/auth/supabaseAuth.ts. Set AUTH_DRIVER=dev (default) until this is ready.",
    );
  }
}
