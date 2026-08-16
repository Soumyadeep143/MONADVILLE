import type { RequestHandler } from "express";

// api.md §16: "Economic mutations should use an idempotency key... prevents
// duplicate transactions when requests/retries happen." Keyed by
// method+path+key so the same key can't collide across unrelated endpoints.
// In-memory, TTL'd — swap for a shared store (Redis, a Mongo collection) if
// this ever runs multi-instance; the interface (get/set) is the seam.

interface CachedResponse {
  status: number;
  body: unknown;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24h, matches the documented use case: retry protection, not permanent dedup
const store = new Map<string, CachedResponse>();

function sweepExpired(now: number): void {
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}

/**
 * Apply to mutating routes. When the caller sends an `Idempotency-Key`
 * header, a repeated request with the same key (+ method + path) replays
 * the first response instead of re-executing the handler. Requests without
 * the header are unaffected — idempotency is opt-in for callers that need
 * safe retries, not mandatory for every mutation.
 */
export const idempotent: RequestHandler = (req, res, next) => {
  const key = req.header("idempotency-key");
  if (!key) {
    next();
    return;
  }

  const now = Date.now();
  sweepExpired(now);
  const cacheKey = `${req.method}:${req.originalUrl}:${key}`;
  const cached = store.get(cacheKey);
  if (cached) {
    res.status(cached.status).json(cached.body);
    return;
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    if (res.statusCode < 500) {
      store.set(cacheKey, { status: res.statusCode, body, expiresAt: now + TTL_MS });
    }
    return originalJson(body);
  }) as typeof res.json;

  next();
};
