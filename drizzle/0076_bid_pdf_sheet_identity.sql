-- A plan page's sheet NUMBER and TITLE (E-101, Lighting Plan), and where each
-- came from. references/plan-viewer-overhaul.md § 17.4, piece 2.
--
-- ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE. A new table, no UPDATE, and no
-- existing table or column touched. Old code never reads it; new code against
-- a database without it would fail on every sheet list, so it goes first.
-- **Step 3 is empty.**
--
-- COLLATE named explicitly, as in 0053: the database default can be
-- utf8mb4_0900_ai_ci, and every other table here is utf8mb4_unicode_ci.
CREATE TABLE `bid_pdf_sheet_identity` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bidPdfId` int NOT NULL,
	`userId` int NOT NULL,
	`pageNumber` int NOT NULL,
	`sheetNumber` varchar(32),
	`sheetNumberSource` enum('label','bookmark','titleblock','user'),
	`sheetTitle` varchar(255),
	`sheetTitleSource` enum('label','bookmark','titleblock'),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bid_pdf_sheet_identity_id` PRIMARY KEY(`id`),
	CONSTRAINT `bid_pdf_sheet_identity_pdf_page_uq` UNIQUE(`bidPdfId`,`pageNumber`),
	CONSTRAINT `bid_pdf_sheet_identity_bidPdfId_bid_pdfs_id_fk` FOREIGN KEY (`bidPdfId`) REFERENCES `bid_pdfs`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_pdf_sheet_identity_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	INDEX `bid_pdf_sheet_identity_userId_idx` (`userId`)
) COLLATE=utf8mb4_unicode_ci;
