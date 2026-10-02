-- An assembly's chosen pin look, used on every job
-- (migrations-0098-batch-plan.md § S, Batch 1; track-b-count-pin-styles-plan.md
-- § 6 and § 12). A shipped assembly FORKS on edit, so choosing a look writes the
-- company's own copy — never the shared row.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Three nullable columns, no default, no UPDATE. NULL = automatic, which is
-- what every assembly draws today. Display only; no number moves.
--
-- One ALTER, one statement. Hand-written, not generated (see 0065, 0067).
ALTER TABLE `assemblies`
	ADD `markShape` varchar(16),
	ADD `markLetter` varchar(4),
	ADD `markColor` varchar(7);
