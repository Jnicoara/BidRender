import { z } from "zod";
import { publicProcedure, router } from "./trpc";

/**
 * A liveness check, and nothing else.
 *
 * `publicProcedure` on purpose: the point of a health check is to answer
 * before any session or database work happens, so it stays useful when those
 * are the things that are broken.
 */
export const systemRouter = router({
  health: publicProcedure
    .input(
      z.object({
        timestamp: z.number().min(0, "timestamp cannot be negative"),
      })
    )
    .query(() => ({
      ok: true,
    })),
});
