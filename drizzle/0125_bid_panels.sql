-- THE panels on a bid — one table whatever put a panel there (Track A
-- decision, 2026-10-06, migrations-next-batch.md clash 5): a panel typed in,
-- one read off a schedule (Track C), one a breaker line hangs on (brand line,
-- migrations-0098-batch-plan.md § 10d). Written now for Track C's homerun
-- footage (homerun-footage-plan.md § 9; todo.md "Homerun footage").
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- A new table; nothing existing changes, no number moves.
--
--   name           NULLABLE (Track A, against § 10d's NOT NULL): a schedule
--                  read off a sheet often prints no name near the table
--                  (`PanelSchedule.name` is null then); a screen says so
--                  rather than the reader inventing one.
--   brandLine      NULL = follow the bid, then the company (§ 10d).
--   isExisting     true = already on site, nothing to buy. NULL = not said.
--   lineItemId     the line that furnishes it; NULL when existing or typed.
--   bidPdfId, sheetId   where its SCHEDULE is printed (clash 5). NULL = typed.
--   planSheetId, planX, planY   where the PANEL sits on the plan, page
--                  points (Track C; today per browser). NULL = not placed —
--                  the Measured method then gives no number.
--
-- ── PAIRING RULE ─────────────────────────────────────────────────────────────
-- 0125–0130 reach LIVE only with Track C's homerun footage code
-- (live-release-plan.md). Kept on a branch, not on staging (owner).
--
-- Hand-written, not generated.
CREATE TABLE `bid_panels` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bidId` int NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(64),
	`brandLine` varchar(64),
	`isExisting` boolean,
	`lineItemId` int,
	`bidPdfId` int,
	`sheetId` int,
	`planSheetId` int,
	`planX` decimal(10,2),
	`planY` decimal(10,2),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bid_panels_id` PRIMARY KEY(`id`),
	CONSTRAINT `bid_panels_bidId_bids_id_fk` FOREIGN KEY (`bidId`) REFERENCES `bids`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_panels_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_panels_lineItemId_bid_line_items_id_fk` FOREIGN KEY (`lineItemId`) REFERENCES `bid_line_items`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `bid_panels_bidPdfId_bid_pdfs_id_fk` FOREIGN KEY (`bidPdfId`) REFERENCES `bid_pdfs`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `bid_panels_sheetId_bid_pdf_sheets_id_fk` FOREIGN KEY (`sheetId`) REFERENCES `bid_pdf_sheets`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `bid_panels_planSheetId_bid_pdf_sheets_id_fk` FOREIGN KEY (`planSheetId`) REFERENCES `bid_pdf_sheets`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `bid_panels_userId_bidId_idx` ON `bid_panels` (`userId`,`bidId`);
