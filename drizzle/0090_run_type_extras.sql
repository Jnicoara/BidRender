-- Extra and makeup on a run type (track-b-held-migrations-plan.md § 1, § 5).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Five nullable columns, no default, no UPDATE. NULL is "follow the company",
-- which is what every type does today, so no existing row changes meaning.
-- Old code ignores them; new code against an old database would die on a bare
-- select(). CLAUDE.md § "THREE STEPS, NOT TWO". Step 3 is empty.
--
-- Hand-written, not generated, for the reason 0065 and 0067 give.
--
-- `makeupByKindInches` is a JSON map from a height type's key to whole inches.
-- A map cannot hold one key twice, so there is no uniqueness to enforce; the
-- router validates the shape. Owner Q10: a type's own figure for a kind beats
-- the company's figure for that kind.
ALTER TABLE `takeoff_run_types`
	ADD `conduitExtraPct` decimal(6,4),
	ADD `wireExtraPct` decimal(6,4),
	ADD `makeupDeviceInches` int,
	ADD `makeupPanelInches` int,
	ADD `makeupByKindInches` json;
