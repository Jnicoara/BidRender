-- Verticals on marks: a counted group's drop (Phase 8;
-- track-b-held-migrations-plan.md § 3, § 5; plan-viewer-overhaul.md § 7).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Three nullable columns, no default, no UPDATE. NULL dropKind is "not
-- answered, no drop", which is every group today, so nothing is counted until
-- somebody sets it. Old code ignores them; new code against an old database
-- would die on a bare select(). CLAUDE.md § "THREE STEPS, NOT TWO". Step 3 is
-- empty.
--
-- Hand-written, not generated, for the reason 0065 and 0067 give. The index and
-- the foreign key on dropRunTypeId are 0095, one statement per file, so a slow
-- FK check that fails can only mean "0095 did nothing".
--
-- dropKind is a height type's key (`distribution` answers "no drop");
-- dropHeightInches NULL follows the kind, then the job, then the company;
-- dropRunTypeId NULL means nothing to price it, flagged and left off the bid.
ALTER TABLE `takeoff_groups`
	ADD `dropKind` varchar(64),
	ADD `dropHeightInches` int,
	ADD `dropRunTypeId` int;
