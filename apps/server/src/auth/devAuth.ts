import { randomUUID } from "node:crypto";
import type { AuthProvider, VerifiedIdentity } from "./AuthProvider.js";

// Dev-only stand-in for Supabase Auth. Not signed, not for production — it
// exists so the whole app runs with zero external auth setup. Tokens are
// self-describing (`dev:<base64 json>`), issued by /api/v1/auth/dev-login
// (a convenience endpoint that doesn't exist in docs/api.md, added because
// there's no real Supabase project to authenticate against in this pass).
export class DevAuthProvider implements AuthProvider {
  issueToken(displayName: string): { token: string; identity: VerifiedIdentity } {
    const identity: VerifiedIdentity = { authUserId: `dev_${randomUUID()}`, displayName };
    const token = "dev:" + Buffer.from(JSON.stringify(identity)).toString("base64url");
    return { token, identity };
  }

  async verifyToken(token: string): Promise<VerifiedIdentity | null> {
    if (!token.startsWith("dev:")) return null;
    try {
      const decoded = JSON.parse(Buffer.from(token.slice(4), "base64url").toString("utf8"));
      if (typeof decoded.authUserId === "string" && typeof decoded.displayName === "string") {
        return decoded as VerifiedIdentity;
      }
      return null;
    } catch {
      return null;
    }
  }
}
