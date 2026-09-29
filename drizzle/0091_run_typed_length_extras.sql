-- A typed length, and extra and makeup, on a traced run
-- (track-b-held-migrations-plan.md § 1, § 2, § 5).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Six nullable columns, no default, no UPDATE. Every existing run reads as
-- what it is: measured from its points (typedLengthInches NULL) and following
-- its type (the five extras NULL). Old code ignores them; new code against an
-- old database would die on a bare select(). CLAUDE.md § "THREE STEPS, NOT
-- TWO". Step 3 is empty.
--
-- Hand-written, not generated, for the reason 0065 and 0067 give.
--
-- ── typedLengthInches is its own column ─────────────────────────────────────
-- `lengthInches` is recomputed from the points and written in four places; a
-- typed figure stored there would be overwritten by the next save. Same
-- precision as `lengthInches`. It is the FLAT run along the drawing (owner
-- Q6): verticals and extra are added to it exactly as to a traced length.
--
-- ── Stored on EVERY row of a run ────────────────────────────────────────────
-- The five extras live on root and legs alike, kept equal by the server — the
-- traceMode rule from 0086. typedLengthInches is per row: each leg has its own.
ALTER TABLE `takeoff_runs`
	ADD `typedLengthInches` decimal(14,4),
	ADD `conduitExtraPct` decimal(6,4),
	ADD `wireExtraPct` decimal(6,4),
	ADD `makeupDeviceInches` int,
	ADD `makeupPanelInches` int,
	ADD `makeupByKindInches` json;
