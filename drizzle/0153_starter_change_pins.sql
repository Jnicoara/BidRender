-- 0153 — WHICH COMPANY COPIES A STARTER CHANGE CREATED (2026-10-13; Track C's
-- BS-M4, word for word from references/baseline-screen-plan.md § 10a.2).
-- Track A owns the number.
--
--   starter_change_pins   one row per (change, company) — so undo and the
--                         count know which copies a change pinned.
--     companyOwnerUserId  the company is its OWNER's users.id, the same key
--                         every forked row carries (CLAUDE.md § Data model).
--     forkId              NO FK: it points into whichever table the change
--                         targets (§ 10a.1 #8).
--
-- ── ADDITIVE. STEP 1. SAFE BEFORE THE CODE ─────────────────────────────────
-- One new table. No UPDATE, nothing reads it until C's code ships, no number
-- moves. Step 3 is EMPTY.
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
CREATE TABLE `starter_change_pins` (
	`id` int AUTO_INCREMENT NOT NULL,
	`changeId` int NOT NULL,
	`companyOwnerUserId` int NOT NULL,
	`forkId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `starter_change_pins_id` PRIMARY KEY(`id`),
	CONSTRAINT `starter_change_pins_change_company_uq` UNIQUE(`changeId`,`companyOwnerUserId`),
	CONSTRAINT `starter_change_pins_changeId_starter_changes_id_fk` FOREIGN KEY (`changeId`) REFERENCES `starter_changes`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `starter_change_pins_companyOwnerUserId_users_id_fk` FOREIGN KEY (`companyOwnerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `starter_change_pins_company_idx` ON `starter_change_pins` (`companyOwnerUserId`);
