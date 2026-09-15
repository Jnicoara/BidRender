/**
 * The same-origin upload route — the way a plan gets to storage when the
 * browser is not allowed to talk to storage directly.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * Uploads go browser → S3 through a presigned PUT (see bidPdfsRouter's header).
 * That is the right shape: no body limit, nothing buffered here, real progress.
 * It has one hard requirement nothing in this repo controls — a cross-origin
 * PUT is ALWAYS preflighted, so the storage bucket must publish a CORS rule
 * permitting this origin. When it does not, every upload fails having sent
 * exactly zero bytes, at any file size, forever.
 *
 * That is the state this route was written for, and it is a state the app
 * should not be helpless in. A POST to our own origin is not cross-origin, so
 * no preflight happens and no bucket policy can refuse it. The bytes come here
 * and this process forwards them on, which is the one thing a browser blocked
 * by CORS cannot do for itself.
 *
 * ── It is a fallback, and deliberately second ────────────────────────────────
 * The client tries the direct PUT first and only comes here when that fails
 * having transferred nothing (see shared/uploadDiagnosis.ts — the `blocked`
 * kind). Two reasons for that order rather than routing everything here:
 *
 *   • the direct path has no size ceiling and this one does — the platform caps
 *     a request body, which is the whole reason the direct path was built in
 *     the first place (commit f1b4127);
 *   • when the bucket's CORS rule is eventually added, the good path resumes on
 *     its own, with nothing to remember to switch back.
 *
 * So this is a working app today and dead weight tomorrow, which is the correct
 * direction for a workaround to age in.
 *
 * ── Not tRPC, on purpose ─────────────────────────────────────────────────────
 * tRPC carries JSON. Putting a PDF through it means base64, which inflates the
 * file by a third and was exactly the design that capped uploads around 24MB
 * before f1b4127. This is a raw Express route taking the file as the request
 * body, so a megabyte on the wire is a megabyte of PDF.
 *
 * It must be mounted BEFORE the body parsers in _core/index.ts. `express.json`
 * would not parse `application/pdf` anyway, but relying on a content-type sniff
 * to protect a stream is the kind of thing that breaks quietly later.
 */
import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { sdk } from "./_core/sdk";
import { resolveScope } from "./_core/companyScope";
import { storagePresignPut } from "./storage";
import { diskStorageRoot, writeDiskObjectStream } from "./diskStorage";
import { checkPdfUpload, formatBytes } from "../shared/uploadLimits";
import * as db from "./db";

/**
 * Where this is mounted. Exported so the route, the client and the test cannot
 * drift apart — the same reason BACKUP_PATH is a constant.
 *
 * Deliberately not under `/api/scheduled/`, which the platform reserves for
 * cron callbacks.
 */
export const PLAN_UPLOAD_PATH = "/api/plan-upload";

/**
 * The most this route will accept, independent of MAX_PDF_BYTES.
 *
 * The app accepts plans up to MAX_PDF_BYTES (500MB) and that number is about
 * what a plan set weighs. This is about what a REQUEST can weigh, which is a
 * different question with a different answer: the platform caps an inbound
 * request body — 32 MiB on Cloud Run — and a request over that is severed by
 * infrastructure before this handler is reached, producing precisely the vague
 * mid-transfer death this whole change set exists to eliminate.
 *
 * So the cap is declared here, below the platform's, and enforced with a real
 * message. 25MB rather than 32 leaves room for headers and for the platform
 * limit being lower than documented somewhere — being refused politely at 25MB
 * beats being cut off silently at 32.
 *
 * ── This ceiling is the fallback's, not the app's ────────────────────────────
 * A file between this and MAX_PDF_BYTES is not too big for BidRender. It is too
 * big to rescue this way, and the message says so and names the actual fix,
 * because "your 200MB plan set is too large" would be false and would send the
 * user away to split a file that does not need splitting.
 */
export const PROXY_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;

export type PlanUploadRequest = {
  bidId: number;
  filename: string;
  byteSize: number;
};

export type PlanUploadRefusal = {
  ok: false;
  /** HTTP status to answer with. */
  status: number;
  message: string;
};

export type PlanUploadAcceptance = { ok: true; request: PlanUploadRequest };

/**
 * Validate an upload request without touching the network or the database.
 *
 * Split out from the handler for the same reason `purgeExpiredBids` takes its
 * clock as a parameter: the interesting rules are here, and a rule that can
 * only be exercised by making a real HTTP request with a real 25MB body is a
 * rule that does not get tested.
 */
export function checkProxyUpload(raw: {
  bidId?: unknown;
  filename?: unknown;
  contentLength?: unknown;
}): PlanUploadAcceptance | PlanUploadRefusal {
  const bidId = Number(raw.bidId);
  if (!Number.isInteger(bidId) || bidId <= 0) {
    return { ok: false, status: 400, message: "Which bid is missing." };
  }

  const filename = typeof raw.filename === "string" ? raw.filename.trim() : "";
  if (!filename || filename.length > 512) {
    return { ok: false, status: 400, message: "The file name is missing." };
  }

  const byteSize = Number(raw.contentLength);
  if (!Number.isInteger(byteSize) || byteSize <= 0) {
    return {
      ok: false,
      status: 411,
      message:
        "The upload did not declare its size, so it cannot be checked against the limit before it is sent.",
    };
  }

  // The app's own rules first — type, emptiness, MAX_PDF_BYTES — so a genuinely
  // oversized file gets the app's message about splitting the set rather than
  // this route's message about the fallback.
  const check = checkPdfUpload({ filename, byteSize });
  if (!check.ok) return { ok: false, status: 400, message: check.message };

  if (byteSize > PROXY_UPLOAD_MAX_BYTES) {
    return {
      ok: false,
      status: 413,
      message:
        `${filename} is ${formatBytes(byteSize)}. BidRender accepts plans this large, but the browser is currently ` +
        `blocked from uploading straight to storage, and the stand-in route tops out at ${formatBytes(PROXY_UPLOAD_MAX_BYTES)}. ` +
        `This is a storage configuration problem, not a problem with your file — do not split it. ` +
        `Until it is fixed, only sets under ${formatBytes(PROXY_UPLOAD_MAX_BYTES)} can be attached.`,
    };
  }

  return { ok: true, request: { bidId, filename, byteSize } };
}

/**
 * Take a plan PDF as a request body and put it in storage.
 *
 * Answers `{ storageKey }`. It deliberately does NOT create the bid_pdfs row:
 * `confirmAttach` still does that, so both upload paths converge on one place
 * that records a sheet, with one ownership check and one set of rules. A
 * transfer that dies here leaves an orphaned object and no row, which is the
 * same harmless outcome the direct path already has.
 */
export async function planUploadHandler(req: Request, res: Response) {
  /**
   * The company's scope id, NOT the signed-in person's.
   *
   * ── This route is outside tRPC, so it has to do by hand what `scoped()`
   * does for every other path into a bid ──────────────────────────────────
   * Every row in this app is filed under the company OWNER's id, and a member
   * reads and writes under that same id — see _core/companyScope.ts. This
   * handler used `user.id`, the ACTOR, which is the same number only for an
   * owner working in their own company. For anybody else it broke two ways at
   * once, both silently wrong rather than obviously so:
   *
   *   • `getBidById(bidId, actorId)` finds nothing, so an admin or estimator
   *     uploading to a perfectly ordinary bid was told "Bid not found";
   *   • the key it minted was `bid-plans/{actorId}/…`, which `confirmAttach`
   *     then refuses, because its prefix check is built from `dataUserId`.
   *
   * That was invisible for as long as the direct browser PUT worked, because
   * this route is only a fallback. With the bucket's CORS rule still
   * unapplied (todo.md) the fallback is the ONLY path that works, so it
   * became "no non-owner can attach a plan at all".
   *
   * ── The capability check is here for the same reason ─────────────────────
   * `bidPdfs.createUploadTicket` is a mutation behind `scoped("bids.view",
   * "bids.edit")`. This route bypassed tRPC and therefore bypassed that too,
   * so a viewer — an account deliberately given read-only access — could push
   * a file into storage under the company's prefix. Both upload paths have to
   * apply the same rules or the weaker one is the real rule.
   */
  let dataUserId: number;
  try {
    const user = await sdk.authenticateRequest(req);
    // A cron identity has no business uploading a plan.
    if (user.isCron) {
      res.status(403).json({ message: "Not permitted." });
      return;
    }
    const scope = await resolveScope(user);
    if (!scope.capabilities.includes("bids.edit")) {
      res.status(403).json({
        message: `Your role (${scope.role}) cannot attach a plan to a bid.`,
      });
      return;
    }
    dataUserId = scope.dataUserId;
  } catch {
    // Covers both a bad session and `resolveScope` refusing — a suspended
    // member, or an account belonging to no company. Deliberately one message:
    // the difference is not the uploader's to act on, and saying which would
    // tell an unauthenticated caller that an account exists.
    res.status(401).json({ message: "Sign in to attach a plan." });
    return;
  }

  const checked = checkProxyUpload({
    bidId: req.query.bidId,
    filename: req.query.filename,
    contentLength: req.headers["content-length"],
  });
  if (!checked.ok) {
    res.status(checked.status).json({ message: checked.message });
    return;
  }
  const { bidId, filename, byteSize } = checked.request;

  // Ownership, before a signed URL exists for anything. Same rule as every
  // other path into a bid.
  const bid = await db.getBidById(bidId, dataUserId);
  if (!bid) {
    res.status(404).json({ message: "Bid not found." });
    return;
  }

  try {
    // The same key shape `bidPdfs.createUploadTicket` builds, and it has to
    // stay that way: `confirmAttach` records a sheet from either path and
    // checks the prefix against `dataUserId` before it will.
    const { key, uploadUrl } = await storagePresignPut(
      `bid-plans/${dataUserId}/${bidId}/${filename}`,
      "application/pdf"
    );

    // On-disk storage has no upload URL to forward to: write the stream out
    // here, capped at the size the request declared.
    if (diskStorageRoot()) {
      await writeDiskObjectStream(key, req, byteSize);
      res.status(200).json({ storageKey: key, byteSize });
      return;
    }

    // Streamed rather than buffered: this process must not hold a plan set in
    // memory, which is the failure mode the base64-through-tRPC design had.
    //
    // Content-Length is set explicitly from the incoming request. Without it,
    // undici falls back to chunked transfer-encoding, which S3 refuses on a
    // presigned PUT — so the header is what makes this work at all, not a
    // nicety.
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(byteSize),
      },
      body: Readable.toWeb(req) as ReadableStream<Uint8Array>,
      // Required by undici whenever the body is a stream.
      duplex: "half",
    } as RequestInit & { duplex: "half" });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(
        `[PlanUpload] storage refused ${key}: ${response.status} ${detail.slice(0, 500)}`
      );
      res.status(502).json({
        message: `Storage refused the upload (HTTP ${response.status}). The file reached this server, so this is not a connection problem.`,
      });
      return;
    }

    res.status(200).json({ storageKey: key, byteSize });
  } catch (error) {
    console.error("[PlanUpload] failed:", error);
    res.status(502).json({
      message:
        "The file reached this server but could not be passed on to storage. Nothing was attached.",
    });
  }
}
