/**
 * The no-match search log (shared/searchMiss.ts, server/searchMissLog.ts).
 *
 * ── `record` needs only `library.view`, even though it writes ───────────────
 * The pickers search the library, which needs `library.view`, so anyone who
 * can see a picker can say it found nothing — a viewer who finds nothing is
 * as useful a signal as an estimator. Hence `scoped("library.view",
 * "library.view")`: the mutation asks for the same capability as the search
 * it reports on. It writes only the words, under the company's id
 * (`ctx.scope.dataUserId`), and answers the same way whether it stored them
 * or not — the person searching never sees the log.
 *
 * ── `list` is admin only ─────────────────────────────────────────────────────
 * It reads across every company, the same reach as the AI spend report.
 */
import { z } from "zod";
import { adminProcedure, router, scoped } from "../_core/trpc";
import { listSearchMisses, recordSearchMiss } from "../searchMissLog";
import {
  SEARCH_MISS_MAX_LENGTH,
  SEARCH_MISS_PICKERS,
} from "../../shared/searchMiss";

const searcher = scoped("library.view", "library.view");

export const searchMissesRouter = router({
  record: searcher
    .input(
      z.object({
        picker: z.enum(SEARCH_MISS_PICKERS),
        // A little over the column, so normalising (which trims) decides
        // rather than a refusal the client would only log to the console.
        words: z.string().max(SEARCH_MISS_MAX_LENGTH * 2),
      })
    )
    .mutation(async ({ input, ctx }) => {
      await recordSearchMiss({
        companyUserId: ctx.scope.dataUserId,
        picker: input.picker,
        words: input.words,
        now: new Date(),
      });
      return { ok: true as const };
    }),

  list: adminProcedure.query(() => listSearchMisses()),
});
