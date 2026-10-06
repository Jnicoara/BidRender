-- The AI correction log: one row per correction a person makes to an AI
-- reading, in an IDENTIFIED half (our own debugging, never shared) and an
-- ANONYMISED half (the only columns sharing would ever read). Columns are
-- ai-correction-log-plan.md § 4 and § 9 (on a-plans), plus Track C's
-- pay-once ask columns (legend-and-notes-automation-plan.md) in the same
-- CREATE; numbered 0108 by references/migrations-next-batch.md.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- A new table. Every column nullable except id, action, shareId, createdAt
-- (§ 9). Nothing may export, pool or share it until users have agreed to
-- terms that say so (todo.md, owner 2026-09-27) — that is code, not schema.
--
-- Track A's picks where § 4 gave no type (2026-10-06) — sizes follow the
-- source columns they copy, so nothing is cut on the way in:
--   shareId            varchar(32): 16 random bytes base64url are 22 chars.
--   action, cropStatus enums of exactly § 2's and § 4's lists.
--   aiLabel, *AssemblyName  varchar(255), as plan_copilot_findings.
--   x, y               decimal(12,4), as the finding.
--   tier, score        the finding's confidence enum and decimal(5,4).
--   model              varchar(128), as plan_copilot_runs.model.
--   labelNormalised    varchar(40): owner Q4, "cut to 40 characters".
--   aiKind, userKind   varchar(64): an assembly CATEGORY, never a name.
--   trade              varchar(64), as assemblies.trade ("Plus `trade`").
--   sheetDiscipline    varchar(8): the sheet number's letter prefix only.
--   month              char(7), 'YYYY-MM' — never a timestamp (§ 4).
--   cropKey            varchar(512); crop sizes int, points/pixel (10,4).
--
-- Hand-written, not generated.
CREATE TABLE `ai_correction_log` (
	`id` int AUTO_INCREMENT NOT NULL,
	`dataUserId` int,
	`actorUserId` int,
	`bidId` int,
	`sheetId` int,
	`findingId` int,
	`stampId` int,
	`aiLabel` varchar(255),
	`aiAssemblyName` varchar(255),
	`userAssemblyName` varchar(255),
	`x` decimal(12,4),
	`y` decimal(12,4),
	`userValue` json,
	`shareId` varchar(32) NOT NULL,
	`action` enum('dismissed','relabelled','deleted','location_set','deleted_with_group','accepted') NOT NULL,
	`model` varchar(128),
	`tier` enum('high','low','unreadable'),
	`score` decimal(5,4),
	`labelNormalised` varchar(40),
	`aiKind` varchar(64),
	`userKind` varchar(64),
	`trade` varchar(64),
	`sheetDiscipline` varchar(8),
	`month` char(7),
	`cropKey` varchar(512),
	`cropStatus` enum('pending','stored','unavailable','failed'),
	`cropWidth` int,
	`cropHeight` int,
	`cropPointsPerPixel` decimal(10,4),
	`askKind` enum('crop','note'),
	`askFingerprint` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `ai_correction_log_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_correction_log_shareId_unique` UNIQUE(`shareId`),
	CONSTRAINT `ai_correction_log_dataUserId_users_id_fk` FOREIGN KEY (`dataUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `ai_correction_log_actorUserId_users_id_fk` FOREIGN KEY (`actorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `ai_correction_log_bidId_bids_id_fk` FOREIGN KEY (`bidId`) REFERENCES `bids`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `ai_correction_log_sheetId_bid_pdf_sheets_id_fk` FOREIGN KEY (`sheetId`) REFERENCES `bid_pdf_sheets`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `ai_correction_log_findingId_plan_copilot_findings_id_fk` FOREIGN KEY (`findingId`) REFERENCES `plan_copilot_findings`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `ai_correction_log_dataUserId_createdAt_idx` ON `ai_correction_log` (`dataUserId`,`createdAt`);
--> statement-breakpoint
CREATE INDEX `ai_correction_log_dataUserId_askFingerprint_idx` ON `ai_correction_log` (`dataUserId`,`askFingerprint`);
