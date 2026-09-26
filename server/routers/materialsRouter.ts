/**
 * Materials library API (Foundation).
 *
 * The one material list in this app. /matdb (Supplier Pricing) used to run on a
 * separate 1,103-row dataset with its own router; that is gone, and this router
 * now serves both screens. See server/db.ts § Materials.
 *
 * The fork model is deliberately hidden from callers. A screen edits a material
 * by id and does not need to know whether it is a shipped baseline row or the
 * user's own: `update` forks on demand and reports back which happened, so the
 * UI can say "you now have your own copy" without orchestrating it.
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, scoped } from "../_core/trpc";
import {
  LIBRARY_STATUSES,
  MATERIAL_CATEGORIES,
  MATERIAL_UNITS_OF_SALE,
} from "../../drizzle/schema";
import { AiLimitReached, invokeLLM } from "../llm";

/**
 * The model that suggests trade slang for a material.
 *
 * The fast tier, because this is a short text-in/text-out job whose output a
 * human reads and edits before it is saved — CLAUDE.md's rule about picking the
 * cheapest tier that does the work. Env-overridable, like the other two, so a
 * model id that turns out to be wrong is a setting rather than a deploy.
 */
export const MATERIAL_ALIAS_MODEL =
  process.env.MATERIAL_ALIAS_MODEL?.trim() || "claude-haiku-4-5-20251001";
import { aiFeaturesEnabled } from "../aiFeatures";
import {
  aliasPromptFor,
  filterAliasSuggestions,
  parseAliasResponse,
} from "../../shared/aliasSuggestions";
import * as db from "../db";
import { STICK_JOINTS } from "../../shared/runFittings";

/**
 * This router's gate: a query needs `library.view`, a mutation needs `library.edit`.
 * Chosen by operation type in `scoped` so a route added later is covered
 * without anyone remembering to tag it. See _core/trpc.ts.
 */
const procedure = scoped("library.view", "library.edit");

/** decimal(10,4) — four decimal places, and it must stay under 10 total digits. */
const MAX_COST = 999999.9999;
const MAX_LABOR_UNIT_HOURS = 12;
const costSchema = z.number().min(0).max(MAX_COST);

/**
 * The material's default labor unit: hours per unit of sale.
 *
 * NULLABLE, and null is a REAL value here meaning "unset this again" — the same
 * omitted-versus-null distinction `categorySchema` makes. It is not the same as
 * zero: a deliberate 0 says "this part adds no time of its own", while null says
 * nobody has decided. See `shared/materialLabor.ts`.
 *
 * Capped well above any real unit. A day and a half to install one of anything
 * is not a labor unit, it is a typo or a number typed in minutes.
 */
const laborUnitSchema = z.number().min(0).max(MAX_LABOR_UNIT_HOURS).nullable();
const nameSchema = z.string().trim().min(1).max(512);

/**
 * Optional everywhere. `null` is a real value meaning "unshelve this" — distinct
 * from omitting the key, which leaves the existing category alone.
 */
const categorySchema = z.enum(MATERIAL_CATEGORIES).nullable();

/** Space-separated trade slang. Loose text by design — no vocabulary to enforce. */
const aliasSchema = z.string().trim().max(1024).nullable();

/** The user's note of the brand or part number they buy. Free text. */
const brandNoteSchema = z.string().trim().max(255).nullable();
const supplierSchema = z.string().trim().max(128).nullable();
/** A stick length or strap spacing: positive, and nothing silly. */
const feetSchema = z.number().positive().max(100);

/** Money crosses the boundary as a number and is stored as an exact decimal string. */
const toDecimal = (value: number) => value.toFixed(4);

export const materialsRouter = router({
  /** The working list, or the archive. Never returns `deleted` tombstones. */
  list: procedure
    .input(
      z
        .object({
          status: z
            .enum(LIBRARY_STATUSES)
            .exclude(["deleted"])
            .default("active"),
        })
        .optional()
    )
    .query(async ({ input, ctx }) => {
      return db.getLibraryMaterials(
        ctx.scope.dataUserId,
        input?.status ?? "active"
      );
    }),

  /**
   * Suggest trade slang for a material the user is adding.
   *
   * ── Suggested, never applied ─────────────────────────────────────────────
   * Returns candidates for a human to accept or reject. Nothing is written
   * here, and the caller stores only what the user ticked — an alias is a
   * claim about what a thing is called, and a wrong one silently mis-ranks
   * every future search for it.
   *
   * ── The safety rule is enforced in code, not asked for in prose ──────────
   * Whatever comes back is put through `filterAliasSuggestions`, which drops
   * anything naming a DIFFERENT material in this user's catalog. That is the
   * failure that made searching "recep" return "Wall plate" first, and it is
   * invisible until someone notices their results are wrong — so it is not
   * left to the model's good behaviour.
   *
   * Degrades to an empty list rather than failing: no API key, a refusal, a
   * timeout, unparseable output all mean "no suggestions", and the user types
   * their own. Search must never depend on this being available.
   */
  suggestAliases: procedure
    .input(
      z.object({
        name: nameSchema,
        category: categorySchema.default(null),
        /** Aliases already on the row, so nothing is offered twice. */
        existing: z.string().max(1024).nullable().default(null),
      })
    )
    .mutation(async ({ input, ctx }) => {
      if (!aiFeaturesEnabled()) {
        return { suggestions: [] as string[], available: false };
      }
      // Every other material this user can see — the list a suggestion must
      // not collide with.
      const catalog = await db.getLibraryMaterials(ctx.scope.dataUserId);
      const otherMaterialNames = catalog
        .filter(m => m.name.toLowerCase() !== input.name.toLowerCase())
        .map(m => m.name);

      let raw: string[] = [];
      try {
        const result = await invokeLLM({
          feature: "material-aliases",
          user: ctx.user,
          model: MATERIAL_ALIAS_MODEL,
          messages: [
            {
              role: "user",
              content: aliasPromptFor(input.name, input.category),
            },
          ],
          maxTokens: 400,
        });
        const content = result.choices?.[0]?.message?.content;
        const text =
          typeof content === "string"
            ? content
            : Array.isArray(content)
              ? content.map(part => ("text" in part ? part.text : "")).join(" ")
              : "";
        raw = parseAliasResponse(text);
      } catch (error) {
        // Not an error the user needs to see, allowance included. The manual
        // field is right there, and a failed suggestion is a missing
        // convenience rather than a broken save — so this is the one AI feature
        // whose limit needs no message of its own.
        if (error instanceof AiLimitReached) {
          console.warn("[suggestAliases] daily allowance reached");
        } else {
          console.warn("[suggestAliases] unavailable:", error);
        }
        return { suggestions: [], available: false };
      }

      return {
        suggestions: filterAliasSuggestions(raw, {
          name: input.name,
          otherMaterialNames,
          existing: input.existing,
        }),
        available: true,
      };
    }),

  /**
   * The materials this user reached for most recently, newest first.
   *
   * The Assembly Builder shows these before anything is typed — the same dozen
   * parts go into most recipes, and making them a click away beats making them
   * a search away.
   */
  /**
   * How often each material appears on this company's bids, for the search
   * ranking's tiebreak. Per company (`dataUserId`), never pooled across
   * companies — see getMaterialUsageForCompany.
   */
  usage: procedure.query(async ({ ctx }) => {
    return db.getMaterialUsageForCompany(ctx.scope.dataUserId);
  }),

  recent: procedure
    .input(
      z.object({ limit: z.number().int().min(1).max(24).default(8) }).optional()
    )
    .query(async ({ input, ctx }) => {
      return db.getRecentMaterialsForUser(
        ctx.scope.dataUserId,
        input?.limit ?? 8
      );
    }),

  get: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .query(async ({ input, ctx }) => {
      const material = await db.getMaterialById(input.id, ctx.scope.dataUserId);
      if (!material)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material not found.",
        });
      return material;
    }),

  create: procedure
    .input(
      z.object({
        name: nameSchema,
        unitOfSale: z.enum(MATERIAL_UNITS_OF_SALE).default("each"),
        costPerUnit: costSchema.default(0),
        laborHours: laborUnitSchema.optional(),
        category: categorySchema.default(null),
        searchAliases: aliasSchema.default(null),
        brandNote: brandNoteSchema.default(null),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Block exact-name duplicates against everything the user can already see.
      // Customising the existing row is nearly always what was meant.
      const existing = await db.getLibraryMaterials(ctx.scope.dataUserId);
      const clash = existing.find(
        m => m.name.toLowerCase() === input.name.toLowerCase()
      );
      if (clash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A material named "${clash.name}" already exists. Edit that one instead of adding a duplicate.`,
        });
      }

      const id = await db.createMaterial({
        userId: ctx.scope.dataUserId,
        name: input.name,
        unitOfSale: input.unitOfSale,
        costPerUnit: toDecimal(input.costPerUnit),
        // Absent stays NULL: a new material has no labor unit until somebody
        // says so, and NULL is what the flag and the filter look for.
        laborHours:
          input.laborHours == null ? null : toDecimal(input.laborHours),
        category: input.category,
        searchAliases: input.searchAliases,
        brandNote: input.brandNote,
      });
      return db.getMaterialById(id, ctx.scope.dataUserId);
    }),

  /**
   * Edit a material. Editing a baseline row forks it first and applies the edit
   * to the user's copy, leaving the shipped row untouched.
   *
   * Returns the row that actually holds the edit — its id differs from the input
   * id when a fork happened, so callers should use the returned material.
   *
   * Writing a cost stamps `priceUpdatedAt`, which is what price staleness is
   * measured from. It is stamped HERE rather than by the caller so every route
   * to a price — this screen, Supplier Pricing, a CSV import — ages the same
   * way. A price set through a path that forgot to stamp would show as fresh
   * forever, which is the exact failure the colouring exists to catch.
   */
  update: procedure
    .input(
      z.object({
        id: z.number().int().positive(),
        name: nameSchema.optional(),
        unitOfSale: z.enum(MATERIAL_UNITS_OF_SALE).optional(),
        costPerUnit: costSchema.optional(),
        laborHours: laborUnitSchema.optional(),
        category: categorySchema.optional(),
        searchAliases: aliasSchema.optional(),
        brandNote: brandNoteSchema.optional(),
        supplierName: supplierSchema.optional(),
        /*
          The raceway facts the fitting count reads (0082). Editable DEFAULTS:
          a company that buys 20 ft PVC or straps at 8 ft changes them here,
          which forks the row like any other edit. Omitted leaves a field
          alone; null clears it back to "not said", and the count then says so.
        */
        stickLengthFeet: feetSchema.nullable().optional(),
        stickJoint: z.enum(STICK_JOINTS).nullable().optional(),
        strapSpacingFeet: feetSchema.nullable().optional(),
        strapFromBoxFeet: z.number().min(0).max(100).nullable().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const {
        id,
        costPerUnit,
        laborHours,
        stickLengthFeet,
        strapSpacingFeet,
        strapFromBoxFeet,
        ...rest
      } = input;
      const feetColumn = (value: number | null | undefined) =>
        value === undefined
          ? undefined
          : value === null
            ? null
            : value.toFixed(2);

      const target = await db.getMaterialById(id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material not found.",
        });

      const isBaseline = target.userId === null;
      const editableId = isBaseline
        ? await db.forkMaterial(id, ctx.scope.dataUserId)
        : id;

      await db.updateMaterial(editableId, ctx.scope.dataUserId, {
        ...rest,
        ...(costPerUnit !== undefined
          ? { costPerUnit: toDecimal(costPerUnit), priceUpdatedAt: new Date() }
          : {}),
        /*
          OMITTED leaves it alone; NULL clears it back to unset.

          Spelled out rather than folded into `rest`, because the two cases
          have to stay apart: a form that does not show this field must not
          write it, and a user emptying the box must be able to get back to
          "nobody has said" rather than being stuck at a zero that prices work
          at nothing. CLAUDE.md § rule 7.
        */
        ...(laborHours !== undefined
          ? { laborHours: laborHours === null ? null : toDecimal(laborHours) }
          : {}),
        ...(stickLengthFeet !== undefined
          ? { stickLengthFeet: feetColumn(stickLengthFeet) }
          : {}),
        ...(strapSpacingFeet !== undefined
          ? { strapSpacingFeet: feetColumn(strapSpacingFeet) }
          : {}),
        ...(strapFromBoxFeet !== undefined
          ? { strapFromBoxFeet: feetColumn(strapFromBoxFeet) }
          : {}),
      });

      const material = await db.getMaterialById(
        editableId,
        ctx.scope.dataUserId
      );
      return { material, forked: isBaseline };
    }),

  /**
   * Take a private copy of a baseline material without changing anything yet —
   * the "customise" action, as opposed to editing a field directly.
   */
  fork: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getMaterialById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material not found.",
        });
      if (target.userId !== null) return target; // already the user's own

      const forkId = await db.forkMaterial(input.id, ctx.scope.dataUserId);
      return db.getMaterialById(forkId, ctx.scope.dataUserId);
    }),

  /** Discard edits to a forked material and restore the shipped version. */
  revert: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getMaterialById(input.id, ctx.scope.dataUserId);
      if (!target || target.userId !== ctx.scope.dataUserId) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material not found.",
        });
      }
      if (target.baselineId == null) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This material was created from scratch, so there is no original to restore.",
        });
      }

      await db.revertMaterialToBaseline(input.id, ctx.scope.dataUserId);
      return db.getMaterialById(input.id, ctx.scope.dataUserId);
    }),

  /**
   * "Delete" from the working list — actually an archive, always recoverable.
   *
   * The same lifecycle Modifiers has used since Foundation. It used to set
   * `isActive = false`, which hid the row with no way back: a delete wearing a
   * softer name. Assemblies may already reference the material, so it keeps its
   * id either way.
   *
   * Works on starters too: archiving one forks it first, so the shared row is
   * never touched. The returned id may therefore differ from the input id —
   * callers refetch rather than patching the row they sent. A starter the user
   * never asked for is theirs to put away; expecting them to scroll past 600
   * shipped materials forever was the odd position, not this.
   */
  archive: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getMaterialById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material not found.",
        });
      if (target.status === "archived")
        return { id: input.id, alreadyArchived: true };

      const archivedId = await db.archiveMaterial(
        input.id,
        ctx.scope.dataUserId
      );
      return { id: archivedId, alreadyArchived: false };
    }),

  /** Put an archived material back on the working list. */
  restore: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getMaterialById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material not found.",
        });
      if (target.status !== "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "That material is not archived.",
        });
      }
      await db.restoreMaterial(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  /**
   * Permanent removal. Refuses anything not already archived, so there is no
   * path from the working list straight to destruction — the user archives
   * first, then confirms again in the Archived view.
   */
  deleteForever: procedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      const target = await db.getMaterialById(input.id, ctx.scope.dataUserId);
      if (!target)
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Material not found.",
        });
      if (target.status !== "archived") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Only archived materials can be deleted permanently. Archive it first.",
        });
      }
      await db.deleteMaterialForever(input.id, ctx.scope.dataUserId);
      return { success: true };
    }),

  /**
   * Apply a supply-house price list to the REAL catalog.
   *
   * This is what the old Supplier Pricing screen did against its own separate
   * 1,103-row dataset, pointed at the catalog everything else already uses.
   * There is one material list in this app, and a CSV is a way to price it —
   * not a way to grow a second one.
   *
   * ── Matches by name, and never creates ───────────────────────────────────────
   * A row whose name matches nothing is REPORTED, not inserted. Inserting would
   * quietly rebuild the two-catalog problem one import at a time: a supplier
   * sheet is full of items this contractor does not stock, and each unmatched
   * line would become a material nobody curated, with no aliases, no category
   * and no size ordering. The user gets the list back and decides.
   *
   * Baselines fork on write, exactly as a hand edit does — a shared row cannot
   * carry one user's supplier price.
   */
  importPrices: procedure
    .input(
      z.object({
        supplierName: z.string().trim().min(1).max(128),
        rows: z
          .array(
            z.object({
              name: nameSchema,
              costPerUnit: costSchema,
            })
          )
          .min(1)
          .max(5000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const existing = await db.getLibraryMaterials(
        ctx.scope.dataUserId,
        "active"
      );
      // Name match is case- and space-insensitive: a supply house writes
      // "12-2 NM-B" where the catalog says "12-2 NM-B " often enough that an
      // exact match would report half a real price list as unmatched.
      const key = (name: string) =>
        name.trim().toLowerCase().replace(/\s+/g, " ");
      const byName = new Map(existing.map(row => [key(row.name), row]));

      const priced: string[] = [];
      const unmatched: string[] = [];
      const stamped = new Date();

      for (const row of input.rows) {
        const target = byName.get(key(row.name));
        if (!target) {
          unmatched.push(row.name);
          continue;
        }
        const editableId =
          target.userId === null
            ? await db.forkMaterial(target.id, ctx.scope.dataUserId)
            : target.id;

        await db.updateMaterial(editableId, ctx.scope.dataUserId, {
          costPerUnit: toDecimal(row.costPerUnit),
          supplierName: input.supplierName,
          priceUpdatedAt: stamped,
        });
        priced.push(target.name);
      }

      return { priced, unmatched };
    }),
});
