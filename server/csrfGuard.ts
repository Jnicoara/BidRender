/**
 * A tRPC CALL THAT CHANGES SOMETHING MUST ARRIVE AS JSON.
 *
 * Security sweep, 2026-10-14 (`references/security-sweep.md`, finding S9).
 *
 * ── The hole ─────────────────────────────────────────────────────────────────
 * In production the session cookie is `SameSite=None` (server/_core/cookies.ts
 * — a leftover from the Manus preview frame), so a page on ANY site can make
 * the browser send it. tRPC v11 accepts a POST as `multipart/form-data` —
 * one of the three content types a plain HTML form may send to another site
 * with no CORS preflight — and runs it as a mutation with a FormData input.
 * A mutation that takes no input, or only optional fields, then runs as the
 * signed-in contractor: clear the company logo, remove the sample bid, accept
 * every labor-step suggestion, or, for a platform admin, start a full backup.
 * Sixteen mutations on the day it was found (`server/csrfGuard.test.ts`).
 *
 * ── The fix ──────────────────────────────────────────────────────────────────
 * Our own client only ever sends `application/json` (httpBatchLink,
 * client/src/main.tsx), and `application/json` is NOT a type a cross-site page
 * can send without a preflight — which fails, because this server publishes
 * no CORS rule. So any other content type on a POST is refused before tRPC
 * sees it. That closes the hole whatever the cookie says; making the cookie
 * `SameSite=Lax` as well is written up for Track A (it changes live sign-in).
 *
 * GET is left alone: tRPC refuses a mutation over GET, and a query's reply
 * cannot be read by another site.
 */
import type { NextFunction, Request, Response } from "express";

/** True when a request to the tRPC endpoint must be refused. */
export function isForgeableTrpcPost(
  method: string,
  contentType: string | undefined
): boolean {
  if (method.toUpperCase() !== "POST") return false;
  const type = (contentType ?? "").split(";")[0].trim().toLowerCase();
  return type !== "application/json";
}

/** Express middleware, mounted on `/api/trpc` ahead of tRPC. */
export function refuseForgeableTrpcPost(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (isForgeableTrpcPost(req.method, req.headers["content-type"])) {
    res.status(415).json({
      error: { message: "Requests to this endpoint must be JSON." },
    });
    return;
  }
  next();
}
