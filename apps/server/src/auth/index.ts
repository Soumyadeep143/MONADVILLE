import type { RequestHandler } from "express";
import { env } from "../config/env.js";
import type { AuthProvider } from "./AuthProvider.js";
import { DevAuthProvider } from "./devAuth.js";
import { SupabaseAuthProvider } from "./supabaseAuth.js";
import { getRepositories } from "../persistence/index.js";

let provider: AuthProvider | null = null;
export function getAuthProvider(): AuthProvider {
  if (provider) return provider;
  provider =
    env.AUTH_DRIVER === "supabase" ? new SupabaseAuthProvider(env.SUPABASE_URL ?? "", env.SUPABASE_ANON_KEY ?? "") : new DevAuthProvider();
  return provider;
}

export const devAuthProvider = new DevAuthProvider();

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string; // internal User document id, not the auth provider's id
      authUserId?: string;
    }
  }
}

/** api.md §17: every authoritative operation is server-side; nothing trusts the frontend. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Missing bearer token" } });
    return;
  }

  const identity = await getAuthProvider().verifyToken(token);
  if (!identity) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Invalid token" } });
    return;
  }

  const repos = await getRepositories();
  let user = await repos.users.findByAuthUserId(identity.authUserId);
  if (!user) {
    user = await repos.users.create({ authUserId: identity.authUserId, displayName: identity.displayName });
  }

  req.userId = user.id;
  req.authUserId = identity.authUserId;
  next();
};
