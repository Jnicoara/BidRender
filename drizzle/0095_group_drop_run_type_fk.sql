-- The index and foreign key for 0094's takeoff_groups.dropRunTypeId
-- (track-b-held-migrations-plan.md § 5).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- No new data and no UPDATE. The column is new in 0094 and NULL on every row,
-- so the FK check has nothing to reject: this file is slow on a large table,
-- not risky. `set null` like every other provenance link — deleting a run type
-- leaves a group that says "no type — not on the bid". Step 3 is empty.
--
-- Must run after 0094. Hand-written, not generated, for the reason 0065 and
-- 0067 give. The FK name is drizzle's form and 52 characters
-- (server/migrationRun.test.ts caps it at 64).
ALTER TABLE `takeoff_groups`
	ADD INDEX `takeoff_groups_dropRunTypeId_idx` (`dropRunTypeId`),
	ADD CONSTRAINT `takeoff_groups_dropRunTypeId_takeoff_run_types_id_fk` FOREIGN KEY (`dropRunTypeId`) REFERENCES `takeoff_run_types`(`id`) ON DELETE set null ON UPDATE no action;
