-- Several LOOKS of one legend item, each with the box it was captured with
-- and where conduit meets it (migrations-0098-batch-plan.md § S, Batch 1;
-- Track C's multiple-looks-plan.md § 6; Track B's connect point,
-- track-b-count-pin-styles-plan.md § 12 and connect-point-plan.md § 5).
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- A new table; nothing existing changes. No backfill: an item with no look
-- rows is read as having one box-less look — its old `symbol_links.thumbnail`
-- — exactly as today (multiple-looks-plan.md § 2).
--
--   connectDx, connectDy  NULL = never answered. `0, 0` means "the middle" and
--                      is a real answer, so there is no default.
--   createdByUserId    the PERSON who added the look (authorship only); userId
--                      is the company owner and decides what is read, as on
--                      every table (CLAUDE.md, data model).
--
-- FIVE foreign keys (multiple-looks-plan.md § 6 says four; its own schema lists
-- five — § R.8): userId and symbolLinkId cascade; bidPdfId, sheetId and
-- createdByUserId set null, so deleting a plan set or a person never deletes a
-- company's look.
--
-- Hand-written, not generated (see 0065, 0067).
CREATE TABLE `symbol_looks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`symbolLinkId` int NOT NULL,
	`thumbnail` text,
	`bidPdfId` int,
	`sheetId` int,
	`captureX` decimal(12,4),
	`captureY` decimal(12,4),
	`captureWidth` decimal(12,4),
	`captureHeight` decimal(12,4),
	`connectDx` decimal(10,4),
	`connectDy` decimal(10,4),
	`createdByUserId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `symbol_looks_id` PRIMARY KEY(`id`),
	CONSTRAINT `symbol_looks_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `symbol_looks_symbolLinkId_symbol_links_id_fk` FOREIGN KEY (`symbolLinkId`) REFERENCES `symbol_links`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `symbol_looks_bidPdfId_bid_pdfs_id_fk` FOREIGN KEY (`bidPdfId`) REFERENCES `bid_pdfs`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `symbol_looks_sheetId_bid_pdf_sheets_id_fk` FOREIGN KEY (`sheetId`) REFERENCES `bid_pdf_sheets`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `symbol_looks_createdByUserId_users_id_fk` FOREIGN KEY (`createdByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `symbol_looks_symbolLinkId_idx` ON `symbol_looks` (`symbolLinkId`);
--> statement-breakpoint
CREATE INDEX `symbol_looks_userId_idx` ON `symbol_looks` (`userId`);
