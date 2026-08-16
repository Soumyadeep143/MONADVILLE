import { randomUUID } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ZodError } from "zod";
import { ActionError } from "../economy/errors.js";

// api.md §14: { error: { code, message, requestId } }
export function sendError(res: Response, status: number, code: string, message: string): void {
  res.status(status).json({ error: { code, message, requestId: randomUUID() } });
}

function statusForCode(code: string): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    default:
      return 400;
  }
}

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Wraps an async route handler, turning thrown errors into api.md §14/§15's error envelope. */
export function asyncHandler(fn: Handler): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch((err: unknown) => {
      if (err instanceof ActionError) {
        sendError(res, statusForCode(err.code), err.code, err.message);
        return;
      }
      if (err instanceof ZodError) {
        sendError(res, 400, "INVALID_ACTION", err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "));
        return;
      }
      // eslint-disable-next-line no-console
      console.error(err);
      sendError(res, 500, "INTERNAL_ERROR", err instanceof Error ? err.message : "Unexpected error");
    });
  };
}
