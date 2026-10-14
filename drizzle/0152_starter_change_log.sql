-- 0152 — THE STARTER CHANGE LOG (2026-10-13; Track C's BS-M3, word for word
-- from references/baseline-screen-plan.md § 10a.2). Track A owns the number.
--
--   starter_change_batches   one save from the starter screen, a sheet, a
--                            copy, the seed boot or an undo (`source`).
--     editorUserId   FK users ON DELETE set null — history outlives the
--                    account. NULL is a deleted account OR the seed boot;
--                    `source` says which.
--   starter_changes          one row per change. APPEND-ONLY: inserted, never
--                            updated. An undo is a NEW change in a NEW batch,
--                            pointing back through `undoesChangeId`.
--     targetTable    varchar, not enum: adding kits or labor steps later is
--                    code, not a migration (§ 10a.1 #1).
--     oldValue / newValue   json wrapped as {"v": <value>}; SQL NULL = not
--                    applicable, {"v": null} = the column WAS NULL (§ 10a.1 #3).
--     childRefId     a part change keys by the PART's id (materialId /
--                    modifierId), not the child row's (§ 10a.1 #4).
--     version        the shared row's own version after the change (the
--                    parent's for a part change).
--
-- ── ADDITIVE. STEP 1. SAFE BEFORE THE CODE ─────────────────────────────────
-- Two new tables. No UPDATE, no existing table changed, nothing reads them
-- until C's applyStarterChange ships, no number moves. Step 3 is EMPTY.
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
CREATE TABLE `starter_change_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`editorUserId` int NULL,
	`source` enum('screen','sheet','copy','seed','undo') NOT NULL,
	`fileName` varchar(255) NULL,
	`fileSha256` char(64) NULL,
	`changeCount` int NOT NULL DEFAULT 0,
	`note` varchar(512) NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `starter_change_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `starter_change_batches_editorUserId_users_id_fk` FOREIGN KEY (`editorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE TABLE `starter_changes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`targetTable` varchar(64) NOT NULL,
	`targetRowId` int NOT NULL,
	`kind` enum('field','part_add','part_remove','part_field','item_add','hide','unhide') NOT NULL,
	`field` varchar(64) NULL,
	`childTable` varchar(64) NULL,
	`childRefId` int NULL,
	`oldValue` json NULL,
	`newValue` json NULL,
	`version` int NOT NULL,
	`undoesChangeId` int NULL,
	`note` varchar(512) NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `starter_changes_id` PRIMARY KEY(`id`),
	CONSTRAINT `starter_changes_batchId_starter_change_batches_id_fk` FOREIGN KEY (`batchId`) REFERENCES `starter_change_batches`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `starter_changes_undoesChangeId_starter_changes_id_fk` FOREIGN KEY (`undoesChangeId`) REFERENCES `starter_changes`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `starter_changes_batchId_idx` ON `starter_changes` (`batchId`);
--> statement-breakpoint
CREATE INDEX `starter_changes_target_idx` ON `starter_changes` (`targetTable`,`targetRowId`);
--> statement-breakpoint
CREATE INDEX `starter_changes_undoesChangeId_idx` ON `starter_changes` (`undoesChangeId`);
