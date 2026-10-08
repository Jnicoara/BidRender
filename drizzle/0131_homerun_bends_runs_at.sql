-- Track C's two held controls (owner, 2026-10-07; migrations-next-batch.md
-- § Batch C, "0131 — Track C's two more columns").
--
--   bids.homerunExtraBends   INT. NULL = not set: counted as 1 extra bend per
--                            homerun and shown "not confirmed".
--   takeoff_runs.runsAt      VARCHAR(16): 'ceiling' | 'boxToBox'. NULL =
--                            'ceiling', a drop at every box, as before.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Nullable, NO DEFAULT, no backfill: NULL reads as today's behaviour in both
-- columns, so no bid number moves when this runs. Applied together with
-- 0125–0130 before it and 0132–0134 after it, in that order — the migrator
-- skips a file whose `when` is older than the newest applied.
-- Hand-written, not generated.
ALTER TABLE `bids` ADD `homerunExtraBends` int;
--> statement-breakpoint
ALTER TABLE `takeoff_runs` ADD `runsAt` varchar(16);
