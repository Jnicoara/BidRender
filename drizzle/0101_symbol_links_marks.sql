-- A captured legend symbol's chosen pin look, and its exact original name
-- (migrations-0098-batch-plan.md § S, Batch 1; track-b-count-pin-styles-plan.md
-- § 6 and § 12; Track B's rename, todo.md "Track A (migration, optional)").
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Four nullable columns, no default, no UPDATE.
--   markShape, markLetter, markColor  NULL = automatic, as on assemblies.
--   originalLabel      NULL = never renamed, OR renamed before this column
--                      existed — either way the code falls back to
--                      `lookupKey`, which is what "Reset to original" reads
--                      today (it loses only the capitals). Nothing is broken
--                      without it; with it, the exact original comes back.
-- No capture box here: it lives on the LOOK (`symbol_looks`, 0102).
--
-- One ALTER, one statement. Hand-written, not generated (see 0065, 0067).
ALTER TABLE `symbol_links`
	ADD `markShape` varchar(16),
	ADD `markLetter` varchar(4),
	ADD `markColor` varchar(7),
	ADD `originalLabel` varchar(255);
