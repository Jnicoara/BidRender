-- 0155 — STARTER OFFERS: WHAT A COMPANY HAS SEEN, AND WHAT IT ANSWERED
-- (2026-10-13; Track C's BS-M6, word for word from references/
-- baseline-screen-plan.md § 10a.2). Track A owns the number.
--
--   companies.starterSeenAt   one value per company. NULL = the company's
--                             createdAt. Do NOT backfill it.
--   starter_offer_answers     one row per (company, change). "Accept all"
--                             writes one row per change it takes; un-ignoring
--                             DELETES the row. Answers are state, not the log,
--                             and an undo never rewrites one (§ 10a.1 #13, #14).
--     companyOwnerUserId      the company, as its owner's users.id.
--     answeredByUserId        the PERSON who pressed it, for the audit only.
--
-- ── ADDITIVE. STEP 1. SAFE BEFORE THE CODE ─────────────────────────────────
-- One nullable column with no default, one new table. No UPDATE, nothing
-- reads them until C's code ships, no number moves. Step 3 is EMPTY.
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
ALTER TABLE `companies` ADD `starterSeenAt` timestamp NULL;
--> statement-breakpoint
CREATE TABLE `starter_offer_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`companyOwnerUserId` int NOT NULL,
	`changeId` int NOT NULL,
	`answer` enum('accepted','ignored') NOT NULL,
	`answeredByUserId` int NULL,
	`answeredAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `starter_offer_answers_id` PRIMARY KEY(`id`),
	CONSTRAINT `starter_offer_answers_company_change_uq` UNIQUE(`companyOwnerUserId`,`changeId`),
	CONSTRAINT `starter_offer_answers_companyOwnerUserId_users_id_fk` FOREIGN KEY (`companyOwnerUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `starter_offer_answers_changeId_starter_changes_id_fk` FOREIGN KEY (`changeId`) REFERENCES `starter_changes`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `starter_offer_answers_answeredByUserId_users_id_fk` FOREIGN KEY (`answeredByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
