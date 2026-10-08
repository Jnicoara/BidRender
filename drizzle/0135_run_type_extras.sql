-- M1 of the per-foot items plan (references/per-foot-items-plan.md § 4,
-- owner-approved 2026-10-08): a run type's EXTRAS — per-foot items that
-- follow the traced length, like underground warning tape.
--
--   userId            NULL = shipped; set = the company OWNER's id (a fork).
--   runTypeId         the type it rides on; deleting the type deletes it.
--   baselineExtraId   the shipped extra a fork's copy came from. A bid line
--                     for an extra keys on `baselineExtraId ?? id`, so a
--                     forked type keeps its line (0136, runExtraKey).
--   materialId        `set null`: a deleted material leaves the extra saying
--                     so and pricing nothing, never a different part.
--   feetPerFoot       1.0000 for tape. NOT NULL: an extra with no rate is not
--                     an extra.
--   appliesTo         'flat' = the traced horizontal length only (tape and
--                     tracer wire lie in the trench); 'all' = every installed
--                     foot, verticals included (pull rope, mule tape).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- A new table; nothing existing changes, no number moves. The SEED writes the
-- shipped tape rows on boot, so this must be on a database before a build
-- that seeds them starts against it.
--
-- ── PAIRING ──────────────────────────────────────────────────────────────────
-- 0135–0138 reach LIVE only with the code that reads them (plan § 9).
--
-- Hand-written, not generated.
CREATE TABLE `takeoff_run_type_extras` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`runTypeId` int NOT NULL,
	`baselineExtraId` int,
	`materialId` int,
	`feetPerFoot` decimal(8,4) NOT NULL,
	`appliesTo` enum('flat','all') NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `takeoff_run_type_extras_id` PRIMARY KEY(`id`),
	CONSTRAINT `takeoff_run_type_extras_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `takeoff_run_type_extras_runTypeId_takeoff_run_types_id_fk` FOREIGN KEY (`runTypeId`) REFERENCES `takeoff_run_types`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `takeoff_run_type_extras_materialId_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `takeoff_run_type_extras_runTypeId_idx` ON `takeoff_run_type_extras` (`runTypeId`);
--> statement-breakpoint
CREATE INDEX `takeoff_run_type_extras_userId_idx` ON `takeoff_run_type_extras` (`userId`);
