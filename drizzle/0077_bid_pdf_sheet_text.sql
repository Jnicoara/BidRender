-- The text of each plan page, read once at upload, for searching the set
-- later (references/plan-viewer-overhaul.md § 17.4 and § 17.6).
--
-- ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE. A new table, no UPDATE, nothing
-- existing touched. **Step 3 is empty.**
--
-- Its own table rather than a column beside the sheet numbers: this averages
-- ~10KB a page, and a bare select() of the numbers must not drag it along.
-- MEDIUMTEXT because one dense sheet can pass TEXT's 64KB.
CREATE TABLE `bid_pdf_sheet_text` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bidPdfId` int NOT NULL,
	`userId` int NOT NULL,
	`pageNumber` int NOT NULL,
	`text` mediumtext NOT NULL,
	`hasTextLayer` boolean NOT NULL,
	`extractedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bid_pdf_sheet_text_id` PRIMARY KEY(`id`),
	CONSTRAINT `bid_pdf_sheet_text_pdf_page_uq` UNIQUE(`bidPdfId`,`pageNumber`),
	CONSTRAINT `bid_pdf_sheet_text_bidPdfId_bid_pdfs_id_fk` FOREIGN KEY (`bidPdfId`) REFERENCES `bid_pdfs`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_pdf_sheet_text_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	INDEX `bid_pdf_sheet_text_userId_idx` (`userId`)
) COLLATE=utf8mb4_unicode_ci;
