-- Makeup for a company's height type (track-b-held-migrations-plan.md § 1, § 5).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Two nullable columns, no default, no UPDATE. NULL makeupAt is "a device
-- end", which every type is today; NULL makeupInches is "follow the device or
-- panel figure". Old code ignores them; new code against an old database would
-- die on a bare select(). CLAUDE.md § "THREE STEPS, NOT TWO". Step 3 is empty.
--
-- Hand-written, not generated, for the reason 0065 and 0067 give. A column
-- added to an existing table takes the table's collation, so the enum lands on
-- utf8mb4_unicode_ci on production.
--
-- A makeup-only row for a shipped type leaves `heightInches` NULL, and
-- `resolveMountingHeight` still falls through to the shipped height on NULL —
-- checked in the code for the plan, so adding makeup cannot unset a height.
ALTER TABLE `takeoff_mounting_heights`
	ADD `makeupAt` enum('device','panel'),
	ADD `makeupInches` int;
