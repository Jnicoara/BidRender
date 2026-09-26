-- Branch legs on a traced run (D20 in references/takeoff-spec.md,
-- shared/runNetwork.ts).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- One new table, nullable columns, and two values appended to an enum. No
-- UPDATE at all; no existing value changes meaning. Every existing run reads
-- as what it is: a root (parentRunId NULL) with plain ends (no tee). Old code
-- ignores all of it; new code against an old database would die on a bare
-- select(). CLAUDE.md § "THREE STEPS, NOT TWO". Step 3 is empty.
--
-- Hand-written, not generated, for the reason 0065 and 0067 give. The CREATE
-- TABLE names its collation, per deploying.md § "A new table lands on the
-- WRONG collation".
--
-- ── takeoff_run_tees: where a branch leaves ─────────────────────────────────
-- A stored row, never inferred from two ends lying close together. `fitting`
-- NULL is unanswered, which only a proposal can produce. x/y are DOUBLE like
-- the trace's own JSON points, for the reason 0084 gives.
CREATE TABLE `takeoff_run_tees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`rootRunId` int NOT NULL,
	`x` double NOT NULL,
	`y` double NOT NULL,
	`fitting` enum('box','body','mark'),
	`stampId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `takeoff_run_tees_id` PRIMARY KEY(`id`),
	CONSTRAINT `takeoff_run_tees_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `takeoff_run_tees_rootRunId_takeoff_runs_id_fk` FOREIGN KEY (`rootRunId`) REFERENCES `takeoff_runs`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `takeoff_run_tees_stampId_takeoff_stamps_id_fk` FOREIGN KEY (`stampId`) REFERENCES `takeoff_stamps`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `takeoff_run_tees_rootRunId_idx` ON `takeoff_run_tees` (`rootRunId`);
--> statement-breakpoint
CREATE INDEX `takeoff_run_tees_userId_idx` ON `takeoff_run_tees` (`userId`);
--> statement-breakpoint
-- ── takeoff_runs: which run a leg belongs to, and which ends sit on a tee ───
-- parentRunId always names the ROOT, so the self-reference is one level deep.
-- Deleting the root takes its legs and tees with it; deleting a tee leaves the
-- legs, whose ends become line ends again.
ALTER TABLE `takeoff_runs`
	ADD `parentRunId` int,
	ADD `startTeeId` int,
	ADD `endTeeId` int,
	ADD CONSTRAINT `takeoff_runs_parentRunId_takeoff_runs_id_fk` FOREIGN KEY (`parentRunId`) REFERENCES `takeoff_runs`(`id`) ON DELETE cascade ON UPDATE no action,
	ADD CONSTRAINT `takeoff_runs_startTeeId_takeoff_run_tees_id_fk` FOREIGN KEY (`startTeeId`) REFERENCES `takeoff_run_tees`(`id`) ON DELETE set null ON UPDATE no action,
	ADD CONSTRAINT `takeoff_runs_endTeeId_takeoff_run_tees_id_fk` FOREIGN KEY (`endTeeId`) REFERENCES `takeoff_run_tees`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX `takeoff_runs_parentRunId_idx` ON `takeoff_runs` (`parentRunId`);
--> statement-breakpoint
-- ── bid_line_items: the box at a tee, and its cover ─────────────────────────
-- Appended at the END of the enum, so every stored value keeps its index.
-- `RUN_MATERIAL_ROLES` in drizzle/schema.ts gains these two in the commit that
-- counts tee boxes onto a bid; until then nothing writes them, and a database
-- that accepts two unused values is harmless.
ALTER TABLE `bid_line_items`
	MODIFY COLUMN `runMaterialRole` enum('raceway','conductor','ground','coupling','connector','strap','elbow90','elbow45','fieldBend','lb','pullBox','teeBox','teeCover');
