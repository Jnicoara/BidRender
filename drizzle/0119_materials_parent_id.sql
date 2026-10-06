-- A material's PARENT, for brand variants (CLAUDE.md § Brands;
-- migrations-0098-batch-plan.md § 3). NULL = this row is its own parent —
-- every row today.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- No number moves until variants resolve (Batch 5). Its foreign key is 0120.
--
-- Hand-written, not generated.
ALTER TABLE `materials` ADD `parentId` int;
