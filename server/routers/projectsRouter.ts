import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import * as db from "../db";
import {
  deleteProjectWithFile,
  setProjectPdfReleasingOld,
} from "../storedFiles";
import { storagePut } from "../storage";
import { storageUrl } from "../storageTokens";

/**
 * This router's gate: a query needs `bids.view`, a mutation needs `bids.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("bids.view", "bids.edit");

const PROJECT_STATUS = ["Bidding", "Won", "In Progress", "Lost"] as const;

export const projectsRouter = router({
  /** List all non-archived projects for the current user */
  list: procedure.query(async ({ ctx }) => {
    return db.getProjectsByUser(ctx.scope.dataUserId);
  }),

  /** Search projects by name, customer, or address */
  search: procedure
    .input(z.object({ query: z.string() }))
    .query(async ({ input, ctx }) => {
      if (!input.query.trim())
        return db.getProjectsByUser(ctx.scope.dataUserId);
      return db.searchProjectsByUser(ctx.scope.dataUserId, input.query.trim());
    }),

  /** Get a single project by id (must belong to current user) */
  get: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const project = await db.getProjectById(input.id, ctx.scope.dataUserId);
      if (!project)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found.",
        });
      return project;
    }),

  /** Create a new project */
  create: procedure
    .input(
      z.object({
        name: z.string().min(1).max(255),
        customerName: z.string().max(255).optional(),
        address: z.string().max(512).optional(),
        bidDate: z.string().optional(), // ISO date string "YYYY-MM-DD"
        notes: z.string().max(10000).optional(),
        status: z.enum(PROJECT_STATUS).optional(),
        description: z.string().max(2000).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await db.createProject({
        userId: ctx.scope.dataUserId,
        name: input.name,
        category: "electrical",
        description: input.description ?? null,
        customerName: input.customerName ?? null,
        address: input.address ?? null,
        bidDate: input.bidDate ? new Date(input.bidDate) : null,
        notes: input.notes ?? null,
        status: input.status ?? "Bidding",
      });
      const projects = await db.getProjectsByUser(ctx.scope.dataUserId);
      return projects[0]; // most recently updated = just created
    }),

  /** Update project fields including expanded v5.45 fields */
  update: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: z.string().min(1).max(255).optional(),
        customerName: z.string().max(255).nullable().optional(),
        address: z.string().max(512).nullable().optional(),
        bidDate: z.string().nullable().optional(), // ISO date string "YYYY-MM-DD" or null
        notes: z.string().max(10000).nullable().optional(),
        status: z.enum(PROJECT_STATUS).optional(),
        description: z.string().max(2000).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, bidDate, ...rest } = input;
      const data: Record<string, unknown> = { ...rest };
      if (bidDate !== undefined) {
        data.bidDate = bidDate ? new Date(bidDate) : null;
      }
      await db.updateProject(
        id,
        ctx.scope.dataUserId,
        data as Parameters<typeof db.updateProject>[2]
      );
      return { success: true };
    }),

  /** Archive a project (soft delete) */
  archive: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await db.archiveProject(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  /** Permanently delete a project and all its data */
  delete: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      await deleteProjectWithFile(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  /** Upload a PDF for a project — stores to S3, saves url+key to project row */
  uploadPdf: procedure
    .input(
      z.object({
        projectId: z.number().int().positive(),
        dataUrl: z.string().min(1),
        filename: z.string().max(512).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const project = await db.getProjectById(
        input.projectId,
        ctx.scope.dataUserId
      );
      if (!project)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found.",
        });
      const base64 = input.dataUrl.split(",")[1];
      if (!base64)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Invalid data URL.",
        });
      const buffer = Buffer.from(base64, "base64");
      const filename = input.filename ?? "plan.pdf";
      const storageKey = `pdfs/${ctx.scope.dataUserId}/${input.projectId}/${filename}`;
      const { key, url } = await storagePut(
        storageKey,
        buffer,
        "application/pdf"
      );
      await setProjectPdfReleasingOld(input.projectId, ctx.scope.dataUserId, {
        pdfUrl: url,
        pdfKey: key,
        pdfFilename: filename,
      });
      // `url` from storagePut is the stored reference; what goes back to the
      // browser has to be a tokenized, fetchable one.
      return { key, url: storageUrl(key, new Date()), filename };
    }),

  /** Get the stored PDF URL for a project */
  getPdfUrl: procedure
    .input(z.object({ projectId: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const project = await db.getProjectById(
        input.projectId,
        ctx.scope.dataUserId
      );
      if (!project)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Project not found.",
        });
      if (!project.pdfKey) return { url: null, key: null, filename: null };
      return {
        // Minted per read, from the KEY. `projects.pdfUrl` is a stored display
        // path from before the proxy required a token and is not fetchable.
        url: storageUrl(project.pdfKey, new Date()),
        key: project.pdfKey,
        filename: project.pdfFilename ?? null,
      };
    }),
});
