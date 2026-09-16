/**
 * Plan PDFs attached to a bid. Takeoff redesign, phase 1.
 *
 * ── Many sheets per bid, not one ─────────────────────────────────────────────
 * The legacy `projects` row carried a single PDF inline. A real job arrives as
 * a set — power sheets, lighting sheets, a spec book, an addendum that lands a
 * week later — so this is its own table and a bid holds as many as it needs.
 *
 * ── Bytes never touch this server ────────────────────────────────────────────
 * Uploading is two steps: `createUploadTicket` validates the file and returns a
 * presigned S3 URL, the browser PUTs the bytes straight there, then
 * `confirmAttach` records the row.
 *
 * It used to be one step — the client posted the file as a base64 data URL and
 * this server decoded it. That shape cannot carry a large plan set at all. The
 * app runs on Cloud Run, whose request body limit is 32 MiB, and base64 inflates
 * a file by about a third, so the ceiling was roughly a 24MB PDF no matter what
 * the app's own limit said. Raising `MAX_PDF_BYTES` alone would have moved a
 * number on screen and changed nothing about what actually uploads.
 *
 * Taking this server out of the data path removes that ceiling, stops a large
 * upload being buffered in memory here, and lets the browser report real
 * progress because it owns the transfer.
 *
 * The cost, stated plainly: the server can no longer check the file's magic
 * bytes, because it never sees them. That check now runs in the browser before
 * the upload starts (`looksLikePdf`), which still catches the case it existed
 * for — a file renamed to .pdf — but is a courtesy rather than a control.
 *
 * ── Ownership on every path ──────────────────────────────────────────────────
 * Every procedure resolves the bid through requireBid first. A storage key is
 * guessable enough that "you knew the id" must never be the only thing between
 * one contractor and another contractor's plans.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import { planViewerUrl, storagePresignPut } from "../storage";
import {
  MAX_PARTS_PER_SIGN_REQUEST,
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  listUploadedParts,
  signParts,
} from "../r2Multipart";
import { selectStorageBackend } from "../storageBackend";
import { MAX_PARTS } from "../../shared/multipartPlan";
import {
  detectScaleFromText,
  isAutoApplicable,
  parseScaleText,
} from "../../shared/planScale";
import { checkPdfUpload } from "../../shared/uploadLimits";
import * as db from "../db";

/**
 * This router's gate: a query needs `bids.view`, a mutation needs `bids.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("bids.view", "bids.edit");

/** Filenames are shown, never used as a path. Kept sane rather than sanitised. */
const filenameSchema = z.string().trim().min(1).max(512);

async function requireBid(bidId: number, userId: number) {
  const bid = await db.getBidById(bidId, userId);
  if (!bid)
    throw new TRPCError({ code: "NOT_FOUND", message: "Bid not found." });
  return bid;
}

async function requirePdf(bidPdfId: number, userId: number) {
  const pdf = await db.getBidPdf(bidPdfId, userId);
  if (!pdf)
    throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found." });
  return pdf;
}

/**
 * Refuse a multipart operation unless R2 is the store.
 *
 * The Manus proxy has no equivalent, and quietly doing something else instead
 * would be worse than saying so: a silent single-PUT fallback appears to work
 * and then dies partway through a large file, which is the exact failure this
 * design exists to remove.
 */
function requireR2(what: string) {
  if (selectStorageBackend() !== "r2") {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${what} need the Cloudflare storage backend, which is not switched on for this server.`,
    });
  }
}

/**
 * The storage key has to be one this server would have issued for THIS user
 * and THIS bid.
 *
 * Without it, a caller could name any key in the bucket and have the server
 * sign writes into it — including over another contractor's finished plans.
 * The prefix carries both ids, so checking it is checking both.
 *
 * Applied to every multipart call, not just the first. Each one takes the key
 * as an argument, so each one is its own opportunity to name somebody else's.
 */
function requireOwnKey(storageKey: string, userId: number, bidId: number) {
  if (!storageKey.startsWith(`bid-plans/${userId}/${bidId}/`)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "That upload does not belong to this bid.",
    });
  }
}

/** One sheet as the client sees it — ratio as a number, not a decimal string. */
function toSheetView(row: db.BidPdfSheetRow) {
  return {
    id: row.id,
    bidPdfId: row.bidPdfId,
    pageNumber: row.pageNumber,
    name: row.name,
    nameSource: row.nameSource,
    /** null when no scale is set — measuring features must refuse, not guess. */
    scaleRatio: row.scaleRatio === null ? null : Number(row.scaleRatio),
    scaleText: row.scaleText,
    scaleSource: row.scaleSource,
    detectedScaleText: row.detectedScaleText,
  };
}

/** What the client gets back for one sheet, including where to fetch it. */
async function toView(row: Awaited<ReturnType<typeof db.getBidPdf>> & object) {
  return {
    id: row.id,
    bidId: row.bidId,
    filename: row.filename,
    byteSize: row.byteSize,
    pageCount: row.pageCount,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    /**
     * Where the viewer loads this document from.
     *
     * On R2 this is a long-lived signed R2 link, so pdf.js fetches byte ranges
     * straight from storage and this server is not in the loop. Everywhere else
     * it is the storage-proxy url, which verifies the token in the path before
     * it 307s to a signed URL.
     *
     * Minted here rather than stored, because it expires and because a signed
     * url must never be written down. Every caller of this function has already
     * been through `requireBid`/`requirePdf`, which is what makes handing out
     * the url an authorization decision rather than a lookup.
     */
    url: await planViewerUrl(row.storageKey, new Date()),
  };
}

export const bidPdfsRouter = router({
  /** Every sheet on a bid, in the order they were attached. */
  list: procedure
    .input(z.object({ bidId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      const rows = await db.getBidPdfs(input.bidId, ctx.scope.dataUserId);
      // In parallel: each one may mint a signed link, and on R2 the first for
      // a given key also confirms the object is there. Sequential would make
      // opening a bid wait on one round trip per sheet.
      return Promise.all(rows.map(row => toView(row)));
    }),

  /**
   * Step 1 of attaching a plan: check it, and hand back somewhere to put it.
   *
   * Nothing is recorded yet. A ticket is permission to upload, not a promise
   * that anything did — `confirmAttach` is what creates the row, so a transfer
   * the user cancels or that fails halfway leaves no half-attached sheet in the
   * list.
   *
   * Validation runs here as well as in the browser because a client check is a
   * courtesy, not a control: the size is declared by the caller and must be
   * bounded before a signed URL is issued for it.
   */
  createUploadTicket: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        filename: filenameSchema,
        byteSize: z.number().int().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);

      const check = checkPdfUpload({
        filename: input.filename,
        byteSize: input.byteSize,
      });
      if (!check.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.message });
      }

      const { key, uploadUrl } = await storagePresignPut(
        `bid-plans/${ctx.scope.dataUserId}/${input.bidId}/${input.filename}`,
        "application/pdf"
      );

      return { uploadUrl, storageKey: key };
    }),

  /**
   * ── Sending a large plan set in pieces ─────────────────────────────────────
   *
   * Four procedures, all of which hand out permission and never touch a byte.
   * The browser cuts the file up, sends each piece straight to R2 on a signed
   * url, and comes back here to stitch them together. See shared/multipartPlan
   * for the arithmetic and server/r2Multipart.ts for the storage calls.
   *
   * Only available on R2. The Manus proxy has no equivalent operation, and a
   * silent single-PUT fallback would be worse than a clear refusal: it would
   * appear to work and then fail at whatever size that path actually tops out
   * at, which is the vague mid-transfer death this whole design removes.
   */
  createMultipartUpload: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        filename: filenameSchema,
        byteSize: z.number().int().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      requireR2("Large uploads");

      const check = checkPdfUpload({
        filename: input.filename,
        byteSize: input.byteSize,
      });
      if (!check.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.message });
      }

      // The same key shape the single-PUT ticket builds, hash suffix and all,
      // because `confirmAttach` checks the prefix on whichever path produced it.
      const { key } = await storagePresignPut(
        `bid-plans/${ctx.scope.dataUserId}/${input.bidId}/${input.filename}`,
        "application/pdf"
      );
      const uploadId = await createMultipartUpload(key, "application/pdf");
      return { storageKey: key, uploadId };
    }),

  /**
   * Signed urls for a batch of pieces.
   *
   * Asked for as the upload goes rather than all at once, so a set that takes
   * twenty minutes is not working from urls signed twenty minutes ago.
   */
  signUploadParts: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        storageKey: z.string().min(1).max(1024),
        uploadId: z.string().min(1).max(1024),
        partNumbers: z
          .array(z.number().int().min(1).max(MAX_PARTS))
          .min(1)
          .max(MAX_PARTS_PER_SIGN_REQUEST),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      requireR2("Large uploads");
      requireOwnKey(input.storageKey, ctx.scope.dataUserId, input.bidId);
      return signParts(input.storageKey, input.uploadId, input.partNumbers);
    }),

  /**
   * Which pieces R2 already holds — the whole of how resuming works.
   *
   * Deliberately asks storage rather than trusting anything the browser
   * remembers. A piece the browser believes it sent but that did not survive
   * is exactly the case resuming exists for, and only one of those two sources
   * was actually present when it happened.
   */
  listUploadedParts: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        storageKey: z.string().min(1).max(1024),
        uploadId: z.string().min(1).max(1024),
      })
    )
    .query(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      requireR2("Large uploads");
      requireOwnKey(input.storageKey, ctx.scope.dataUserId, input.bidId);
      return listUploadedParts(input.storageKey, input.uploadId);
    }),

  /** Stitch the pieces into the finished file. Does not record the sheet. */
  completeMultipartUpload: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        storageKey: z.string().min(1).max(1024),
        uploadId: z.string().min(1).max(1024),
        parts: z
          .array(
            z.object({
              partNumber: z.number().int().min(1).max(MAX_PARTS),
              etag: z.string().min(1).max(256),
            })
          )
          .min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      requireR2("Large uploads");
      requireOwnKey(input.storageKey, ctx.scope.dataUserId, input.bidId);
      await completeMultipartUpload(
        input.storageKey,
        input.uploadId,
        input.parts
      );
      return { storageKey: input.storageKey };
    }),

  /**
   * Throw away an upload the user cancelled.
   *
   * Never fails the caller. The bucket's 7-day abort rule is the guarantee that
   * abandoned pieces do not accumulate; this is the courtesy that makes a
   * cancel immediate. Reporting an error because the tidying-up failed would
   * tell the user about a problem that is not theirs and is already handled.
   */
  abortMultipartUpload: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        storageKey: z.string().min(1).max(1024),
        uploadId: z.string().min(1).max(1024),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);
      requireOwnKey(input.storageKey, ctx.scope.dataUserId, input.bidId);
      if (selectStorageBackend() !== "r2") return { aborted: false };
      try {
        await abortMultipartUpload(input.storageKey, input.uploadId);
        return { aborted: true };
      } catch (error) {
        console.warn(
          `[BidPdfs] could not abort an upload for bid ${input.bidId}; the bucket's expiry rule will clear it.`,
          error
        );
        return { aborted: false };
      }
    }),

  /**
   * Step 2: the bytes are in storage — record the sheet.
   *
   * The storage key has to be one this server just issued for this user, which
   * the path prefix carries. Without that check a caller could point a row at
   * any object in the bucket, including another contractor's plans, simply by
   * naming its key.
   */
  confirmAttach: procedure
    .input(
      z.object({
        bidId: z.number().int().positive(),
        filename: filenameSchema,
        storageKey: z.string().min(1).max(1024),
        byteSize: z.number().int().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requireBid(input.bidId, ctx.scope.dataUserId);

      const check = checkPdfUpload({
        filename: input.filename,
        byteSize: input.byteSize,
      });
      if (!check.ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: check.message });
      }

      const expectedPrefix = `bid-plans/${ctx.scope.dataUserId}/${input.bidId}/`;
      if (!input.storageKey.startsWith(expectedPrefix)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "That upload does not belong to this bid.",
        });
      }

      const sortOrder = await db.nextBidPdfSortOrder(
        input.bidId,
        ctx.scope.dataUserId
      );
      const id = await db.createBidPdf({
        bidId: input.bidId,
        userId: ctx.scope.dataUserId,
        filename: input.filename,
        storageKey: input.storageKey,
        byteSize: input.byteSize,
        sortOrder,
      });

      const row = await db.getBidPdf(id, ctx.scope.dataUserId);
      if (!row)
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Attach failed.",
        });
      return toView(row);
    }),

  /**
   * Record the page count once the viewer has parsed the document.
   *
   * Server-side page counting would mean a PDF parser on the server for a
   * number the client already has the moment it opens the file.
   */
  setPageCount: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        pageCount: z.number().int().min(1).max(10000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const row = await db.getBidPdf(input.id, ctx.scope.dataUserId);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
      await db.setBidPdfPageCount(
        input.id,
        ctx.scope.dataUserId,
        input.pageCount
      );
      return { success: true };
    }),

  /**
   * What removing this plan would delete, for the warning shown first.
   *
   * Counts only — it changes nothing. The Takeoff screen will not let a removal
   * be confirmed until this has answered. See references/takeoff-spec.md, V3.
   */
  removalImpact: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requirePdf(input.id, ctx.scope.dataUserId);
      return db.getBidPdfTakeoffCounts(input.id, ctx.scope.dataUserId);
    }),

  /**
   * Remove a plan from a bid — and, through the database's cascade, every
   * sheet, stamp, traced run, circuit and plan-reader result on it.
   *
   * Immediate and unconditional, unlike archiving a bid: a PDF attached to the
   * wrong job is a mistake to undo now, not something to hold for 30 days. The
   * bid's own line items are untouched. The client shows removalImpact first,
   * so nobody confirms this without seeing what it deletes.
   */
  remove: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const row = await db.getBidPdf(input.id, ctx.scope.dataUserId);
      if (!row)
        throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
      await db.deleteBidPdf(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  // ── Sheets (phase 2a) ──────────────────────────────────────────────────────

  /** Every page of one document, in order, with its name and scale. */
  sheets: procedure
    .input(z.object({ bidPdfId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      await requirePdf(input.bidPdfId, ctx.scope.dataUserId);
      const rows = await db.getBidPdfSheets(
        input.bidPdfId,
        ctx.scope.dataUserId
      );
      return rows.map(toSheetView);
    }),

  /**
   * Create the sheet rows for a document, once, from what the viewer parsed.
   *
   * The client supplies these because reading a PDF's outline needs a PDF
   * parser and only the viewer has one. It is called every time a document
   * opens, so it must be — and is — idempotent in the way that matters:
   *
   *   • pages that already have a row are left completely alone;
   *   • only genuinely missing pages are inserted.
   *
   * That means a renamed sheet survives every reopen. Overwriting names from
   * the outline on each open would silently undo the user's corrections, which
   * is the whole reason renaming exists.
   */
  ensureSheets: procedure
    .input(
      z.object({
        bidPdfId: z.number().int().positive(),
        pageCount: z.number().int().min(1).max(10000),
        /** Titles from the PDF outline, where it has one. */
        outline: z
          .array(
            z.object({
              pageNumber: z.number().int().min(1),
              title: z.string().trim().min(1).max(255),
            })
          )
          .max(10000)
          .default([]),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await requirePdf(input.bidPdfId, ctx.scope.dataUserId);

      const existing = await db.getBidPdfSheets(
        input.bidPdfId,
        ctx.scope.dataUserId
      );
      const havePage = new Set(existing.map(s => s.pageNumber));

      // First outline entry wins per page: architectural outlines often nest a
      // detail under its sheet, and the outer entry is the sheet's own name.
      const titleByPage = new Map<number, string>();
      for (const entry of input.outline) {
        if (entry.pageNumber > input.pageCount) continue;
        if (!titleByPage.has(entry.pageNumber))
          titleByPage.set(entry.pageNumber, entry.title);
      }

      const toInsert = [];
      for (let page = 1; page <= input.pageCount; page++) {
        if (havePage.has(page)) continue;
        const bookmarked = titleByPage.get(page);
        toInsert.push({
          bidPdfId: input.bidPdfId,
          userId: ctx.scope.dataUserId,
          pageNumber: page,
          // Never blank. A PDF with no outline still gets a usable label rather
          // than leaving the index a column of bare numbers.
          name: bookmarked ?? `Sheet ${page}`,
          nameSource: bookmarked ? ("bookmark" as const) : ("default" as const),
        });
      }

      await db.insertBidPdfSheets(toInsert);
      const rows = await db.getBidPdfSheets(
        input.bidPdfId,
        ctx.scope.dataUserId
      );
      return { created: toInsert.length, sheets: rows.map(toSheetView) };
    }),

  /** Rename a sheet. Marks the name as the user's, so nothing overwrites it. */
  renameSheet: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().trim().min(1).max(255),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sheet = await db.getBidPdfSheet(input.id, ctx.scope.dataUserId);
      if (!sheet)
        throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
      await db.updateBidPdfSheet(input.id, ctx.scope.dataUserId, {
        name: input.name,
        nameSource: "user",
      });
      return {
        ...toSheetView({ ...sheet, name: input.name, nameSource: "user" }),
      };
    }),

  /**
   * Set a sheet's scale by hand.
   *
   * Always available — not a fallback for when detection fails. Parsed through
   * the same `parseScaleText` detection uses, so a typed scale and a read one
   * produce an identical ratio and only `source` differs.
   */
  setSheetScale: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        /** As written: `1/4" = 1'-0"`, `1" = 20'`, `1:100`. */
        scaleText: z.string().trim().min(1).max(64),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sheet = await db.getBidPdfSheet(input.id, ctx.scope.dataUserId);
      if (!sheet)
        throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });

      const parsed = parseScaleText(input.scaleText);
      if (!parsed) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `“${input.scaleText}” is not a scale this can read. Try 1/4" = 1'-0", 1" = 20', or 1:100.`,
        });
      }

      await db.updateBidPdfSheet(input.id, ctx.scope.dataUserId, {
        scaleRatio: String(parsed.ratio),
        scaleText: parsed.text,
        scaleSource: "manual",
      });
      const updated = await db.getBidPdfSheet(input.id, ctx.scope.dataUserId);
      return toSheetView(updated!);
    }),

  /** Remove a sheet's scale, putting it back to "not set". */
  clearSheetScale: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const sheet = await db.getBidPdfSheet(input.id, ctx.scope.dataUserId);
      if (!sheet)
        throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });
      await db.updateBidPdfSheet(input.id, ctx.scope.dataUserId, {
        scaleRatio: null,
        scaleText: null,
        scaleSource: "none",
      });
      const updated = await db.getBidPdfSheet(input.id, ctx.scope.dataUserId);
      return toSheetView(updated!);
    }),

  /**
   * Report what auto-detection read off a sheet.
   *
   * The confidence decision lives here rather than in the browser so one rule
   * governs what gets applied. Only a HIGH-confidence reading is stored as the
   * sheet's scale; anything less is kept as `detectedScaleText` and offered to
   * the user as a suggestion, because a wrong scale applied silently makes
   * every later measurement wrong by a constant factor with nothing on screen
   * looking broken.
   *
   * Never touches a scale the user set by hand.
   */
  detectSheetScale: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        /** Raw text extracted from the page by the viewer. */
        sheetText: z.string().max(200000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const sheet = await db.getBidPdfSheet(input.id, ctx.scope.dataUserId);
      if (!sheet)
        throw new TRPCError({ code: "NOT_FOUND", message: "Sheet not found." });

      // A hand-set scale is the user's answer and outranks anything read.
      if (sheet.scaleSource === "manual") {
        return {
          applied: false,
          reason: "manual" as const,
          sheet: toSheetView(sheet),
        };
      }

      const detection = detectScaleFromText(input.sheetText);
      const suggestion = detection.best;

      if (suggestion && isAutoApplicable(detection)) {
        await db.updateBidPdfSheet(input.id, ctx.scope.dataUserId, {
          scaleRatio: String(suggestion.ratio),
          scaleText: suggestion.text,
          scaleSource: "detected",
          detectedScaleText: suggestion.text,
        });
      } else {
        // Remember what was seen without acting on it.
        await db.updateBidPdfSheet(input.id, ctx.scope.dataUserId, {
          detectedScaleText: suggestion?.text ?? null,
        });
      }

      const updated = await db.getBidPdfSheet(input.id, ctx.scope.dataUserId);
      return {
        applied: Boolean(suggestion) && isAutoApplicable(detection),
        confidence: detection.confidence,
        notToScale: detection.notToScale,
        candidates: detection.candidates.map(c => ({
          text: c.text,
          ratio: c.ratio,
        })),
        sheet: toSheetView(updated!),
      };
    }),
});
