-- Bends and pull points counted from the trace (shared/runBends.ts).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Two new tables, new nullable columns, and new values appended to an enum.
-- No UPDATE at all; no existing value changes meaning. Old code ignores every
-- one of these; new code against an old database would die on a bare
-- select(). CLAUDE.md § "THREE STEPS, NOT TWO". Step 3 is empty. The 45-degree
-- elbows are seed rows, not this file — they arrive on first boot of the new
-- build, which makes the release a catalog release (deploying.md § 5b).
--
-- Hand-written, not generated, for the reason 0065 and 0067 give. Both
-- CREATE TABLEs name their collation, per deploying.md § "A new table lands
-- on the WRONG collation" — the database default is the other one.
--
-- ── takeoff_bend_defaults: the company's three settings ─────────────────────
-- Every setting NULL-means-shipped-default: 1-1/4" factory elbows, a 360
-- degree pull-point limit, pull boxes from 2". No row at all means all three
-- defaults, so nothing needs inserting for existing companies.
CREATE TABLE `takeoff_bend_defaults` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`factoryElbowFromSize` varchar(16),
	`pullPointLimitDegrees` int,
	`pullBoxFromSize` varchar(16),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `takeoff_bend_defaults_id` PRIMARY KEY(`id`),
	CONSTRAINT `takeoff_bend_defaults_user_uq` UNIQUE(`userId`),
	CONSTRAINT `takeoff_bend_defaults_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
-- ── takeoff_pull_points: a person's answers, never the proposals ────────────
-- x/y are DOUBLE because the trace's points are JSON numbers; a DECIMAL would
-- round them and a rounded answer would never find its corner again.
CREATE TABLE `takeoff_pull_points` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`runId` int NOT NULL,
	`place` enum('corner','end-drop') NOT NULL,
	`x` double NOT NULL,
	`y` double NOT NULL,
	`kind` enum('lb','pullBox') NOT NULL,
	`status` enum('accepted','dismissed') NOT NULL,
	`answeredBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `takeoff_pull_points_id` PRIMARY KEY(`id`),
	CONSTRAINT `takeoff_pull_points_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `takeoff_pull_points_runId_takeoff_runs_id_fk` FOREIGN KEY (`runId`) REFERENCES `takeoff_runs`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `takeoff_pull_points_answeredBy_users_id_fk` FOREIGN KEY (`answeredBy`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `takeoff_pull_points_runId_idx` ON `takeoff_pull_points` (`runId`);
--> statement-breakpoint
CREATE INDEX `takeoff_pull_points_userId_idx` ON `takeoff_pull_points` (`userId`);
--> statement-breakpoint
-- ── materials: labor hours for one field bend, on the raceway row ───────────
-- NULL is "not set", and the bid line reads "Not priced" — never 0.
ALTER TABLE `materials`
	ADD `fieldBendLaborHours` decimal(10,4);
--> statement-breakpoint
-- ── takeoff_run_types: four more optional named parts ───────────────────────
-- `set null` on every link, like 0082's three.
ALTER TABLE `takeoff_run_types`
	ADD `elbow90MaterialId` int,
	ADD `elbow45MaterialId` int,
	ADD `lbMaterialId` int,
	ADD `pullBoxMaterialId` int,
	ADD CONSTRAINT `takeoff_run_types_elbow90MaterialId_materials_id_fk` FOREIGN KEY (`elbow90MaterialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action,
	ADD CONSTRAINT `takeoff_run_types_elbow45MaterialId_materials_id_fk` FOREIGN KEY (`elbow45MaterialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action,
	ADD CONSTRAINT `takeoff_run_types_lbMaterialId_materials_id_fk` FOREIGN KEY (`lbMaterialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action,
	ADD CONSTRAINT `takeoff_run_types_pullBoxMaterialId_materials_id_fk` FOREIGN KEY (`pullBoxMaterialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- ── bid_line_items: five more roles on a run-type line ──────────────────────
-- Appended at the END of the enum, so every stored value keeps its index and
-- MySQL changes it in place. The 0070 unique index (bid, type, role) covers
-- them: one live line per type per role.
ALTER TABLE `bid_line_items`
	MODIFY COLUMN `runMaterialRole` enum('raceway','conductor','ground','coupling','connector','strap','elbow90','elbow45','fieldBend','lb','pullBox');
