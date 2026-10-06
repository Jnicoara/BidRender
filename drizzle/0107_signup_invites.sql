-- The invite gate: codes that let a NEW company sign up, separate from
-- `company_invites` (which add a person to an existing company). Columns are
-- invite-gate-plan.md § 7 (on a-plans), numbered 0107 by
-- references/migrations-next-batch.md.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- A new table; nothing existing changes. Step 3 is empty.
--
-- Track A's picks where § 7 left it open (2026-10-06):
--   codeHash          varchar(64) with a NAMED unique key, as company_invites
--                     actually is (§ 7 wrote char(64) "as company_invites").
--   createdByUserId   FK users ON DELETE CASCADE, as company_invites.
--   no updatedAt      § 7 lists none; accepted/revoked are their own stamps.
--
-- Hand-written, not generated.
CREATE TABLE `signup_invites` (
	`id` int AUTO_INCREMENT NOT NULL,
	`codeHash` varchar(64) NOT NULL,
	`email` varchar(320) NOT NULL,
	`seatLimit` int NOT NULL,
	`earlyAccessId` int,
	`note` varchar(255),
	`expiresAt` timestamp NOT NULL,
	`acceptedAt` timestamp NULL,
	`acceptedByUserId` int,
	`revokedAt` timestamp NULL,
	`createdByUserId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `signup_invites_id` PRIMARY KEY(`id`),
	CONSTRAINT `signup_invites_codeHash_unique` UNIQUE(`codeHash`),
	CONSTRAINT `signup_invites_earlyAccessId_early_access_signups_id_fk` FOREIGN KEY (`earlyAccessId`) REFERENCES `early_access_signups`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `signup_invites_acceptedByUserId_users_id_fk` FOREIGN KEY (`acceptedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `signup_invites_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `signup_invites_email_idx` ON `signup_invites` (`email`);
