-- One row per legend entry read off a plan set: which account symbol it was
-- confirmed (or rejected) as, and where on the set it was read. Columns are
-- legend-reading-plan.md § 5 (on a-plans-reader), WITH Track C's `lookId`
-- (multiple-looks-plan.md; migrations-next-batch.md Batch 4).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- A new table; nothing existing changes.
--
-- Track A's picks where § 5 left it open (2026-10-06):
--   userId         the company owner, FK users ON DELETE CASCADE, as on every
--                  table (§ 5 names the column, no key).
--   symbolLinkId   NULLABLE: § 5 says SET NULL, which needs it. Once a symbol
--                  is deleted, its rows hold NULL and stop colliding in the
--                  unique key — right, since they no longer say anything.
--   status, source NOT NULL, no default: always known when a row is written.
--   x, y, w, h     decimal(12,4), page points, as symbol_looks.
--   SIX foreign keys (§ 5 says "three"; its own listing has four, lookId
--   makes five, userId six — same kind of count drift as 0102, § R.8).
--
-- Hand-written, not generated.
CREATE TABLE `bid_pdf_legend_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`bidPdfId` int NOT NULL,
	`symbolLinkId` int,
	`groupId` int,
	`lookId` int,
	`status` enum('confirmed','rejected') NOT NULL,
	`source` enum('ai','manual','remembered') NOT NULL,
	`sheetId` int,
	`x` decimal(12,4),
	`y` decimal(12,4),
	`w` decimal(12,4),
	`h` decimal(12,4),
	`readLabel` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bid_pdf_legend_entries_id` PRIMARY KEY(`id`),
	CONSTRAINT `bid_pdf_legend_entries_pdf_link_uq` UNIQUE(`bidPdfId`,`symbolLinkId`),
	CONSTRAINT `bid_pdf_legend_entries_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_pdf_legend_entries_bidPdfId_bid_pdfs_id_fk` FOREIGN KEY (`bidPdfId`) REFERENCES `bid_pdfs`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_pdf_legend_entries_symbolLinkId_symbol_links_id_fk` FOREIGN KEY (`symbolLinkId`) REFERENCES `symbol_links`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `bid_pdf_legend_entries_groupId_takeoff_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `takeoff_groups`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `bid_pdf_legend_entries_lookId_symbol_looks_id_fk` FOREIGN KEY (`lookId`) REFERENCES `symbol_looks`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `bid_pdf_legend_entries_sheetId_bid_pdf_sheets_id_fk` FOREIGN KEY (`sheetId`) REFERENCES `bid_pdf_sheets`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `bid_pdf_legend_entries_userId_idx` ON `bid_pdf_legend_entries` (`userId`);
