import { z } from "zod";
import { publicProcedure, router } from "./trpc";

/**
 * `notifyOwner` used to live here, sending through the Manus notification
 * service. Nothing in the app called it and off the platform there is no
 * service behind it, so the procedure is gone; `notification.ts` stays until
 * the Manus helper files are cleared out together.
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
