-- 0149 — SETTINGS FROZEN WHEN A BID LEAVES DRAFT: overhead, profit,
-- productivity AND TAX (2026-10-12; owner Q16, references/baseline-screen-
-- plan.md § 9 F8). Written by Track A: the plan's drafts BS-M1–M8 have no
-- column for this, because overhead, profit and productivity already have
-- per-bid columns (NULL = inherit) and can be frozen by writing the values in
-- effect into them. TAX cannot: its four switches live only on
-- `pricing_defaults`, and a matched or pinned tax area's rate is read live
-- from `tax_jurisdictions`, so editing either re-prices a Won bid.
--
--   settingsFrozenAt      when the values in effect were written onto this
--                         bid. NULL = never frozen (every bid today), so the
--                         bid's own columns are a person's choices, as now.
--                         Set = the columns below and the overhead / profit /
--                         productivity columns were written by the freeze.
--   salesTaxEnabled,      the company's tax switches, per bid. ONE GROUP,
--   taxMaterials,         like overhead and profit: salesTaxEnabled NULL =
--   taxLabor, taxApplyTo  the whole group follows `pricing_defaults`.
--   taxRateFrozenPct      the rate in effect, as a percent. Read only when
--                         settingsFrozenAt is set; NULL then = no rate was in
--                         effect. Never a stand-in for `taxRateOverridePct`,
--                         which means "typed on the bid" and says so.
--   taxRateFrozenDetail   what the screen and the proposal show beside it
--                         (source, area name, the rate's components). Display
--                         only; the number that prices is the column above.
--
-- ── ADDITIVE. STEP 1. MUST RUN BEFORE THE CODE ──────────────────────────────
-- `drizzle/schema.ts` declares all seven, so every bare select() of bids
-- asks for them. Nullable, no defaults, no UPDATE: no bid is frozen by a
-- migration and no number moves. Step 3 is EMPTY — existing non-Draft bids
-- are frozen, if at all, by a dry-run-first release step, not by this file.
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
ALTER TABLE `bids` ADD `settingsFrozenAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `bids` ADD `salesTaxEnabled` boolean NULL;
--> statement-breakpoint
ALTER TABLE `bids` ADD `taxMaterials` boolean NULL;
--> statement-breakpoint
ALTER TABLE `bids` ADD `taxLabor` boolean NULL;
--> statement-breakpoint
ALTER TABLE `bids` ADD `taxApplyTo` enum('price','cost') NULL;
--> statement-breakpoint
ALTER TABLE `bids` ADD `taxRateFrozenPct` decimal(7,4) NULL;
--> statement-breakpoint
ALTER TABLE `bids` ADD `taxRateFrozenDetail` json NULL;
