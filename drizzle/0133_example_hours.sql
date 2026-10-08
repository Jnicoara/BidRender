-- "Example hours" — SHIPPED labor hours say they are an example, the price
-- treatment (owner, 2026-10-07; starter-vs-company-plan.md § "Shipped
-- HOURS"). Shipped TOGETHER with the hours, never hours alone.
--
--   materials.isExampleLaborHours      TRUE on a shipped row whose laborHours /
--                                      fieldBendLaborHours came from the
--                                      starter labor sheet; a shop's edit of
--                                      either clears it on its copy.
--   assemblies.isExampleHours          the same, for a starter assembly's
--                                      baseLaborHours (assembly hours sheet).
--   bid_line_items.snapshotHoursWereExample
--                                      FROZEN at add time: the line's hours
--                                      used an example. Bid screen and the
--                                      print warning only.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Nullable, no DEFAULT, no backfill. NULL = not an example.
--
-- ── NUMBERING / PAIRING ──────────────────────────────────────────────────────
-- After 0132; with Track C's batch and 0132–0134 as one apply.
--
-- Hand-written, not generated.
ALTER TABLE `materials` ADD `isExampleLaborHours` boolean;--> statement-breakpoint
ALTER TABLE `assemblies` ADD `isExampleHours` boolean;--> statement-breakpoint
ALTER TABLE `bid_line_items` ADD `snapshotHoursWereExample` boolean;
