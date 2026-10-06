-- A count's chosen pin look and the legend symbol it belongs to
-- (migrations-0098-batch-plan.md § S, Batch 1; track-b-count-pin-styles-plan.md
-- § 6, § 11.7 and § 12; count-by-tag-plan.md § 2).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Four nullable columns, no default, no UPDATE.
--   markShape, markLetter, markColor  NULL = automatic (the family's shape,
--                      the automatic letter, first-use colour). Stored as
--                      names and `#rrggbb` values, not enums, so a palette or
--                      shape-list change never needs a migration; a value the
--                      code no longer knows reads as automatic, as run-type
--                      colours already do.
--   symbolLookupKey    NULL = not from a symbol. Deliberately NOT a foreign key
--                      to symbol_links: a symbol is per company library, a
--                      count is per bid, and deleting a library symbol must not
--                      touch a bid.
-- None of these moves a number: a pin's look is display only.
--
-- One ALTER, one statement. Hand-written, not generated (see 0065, 0067).
ALTER TABLE `takeoff_groups`
	ADD `markShape` varchar(16),
	ADD `markLetter` varchar(4),
	ADD `markColor` varchar(7),
	ADD `symbolLookupKey` varchar(255);
