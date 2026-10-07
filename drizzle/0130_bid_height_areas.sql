-- Height areas INSIDE a sheet (owner, 2026-10-06: a 18'-0" stockroom drawn
-- inside a 10'-0" sales floor gives its devices 18'-0"). Exactly todo.md
-- "New table for Track A — bid_height_areas" (Track C). Included with the
-- footage batch because it is one plain CREATE; its code is before beta.
--
--   region                    the outline, page points, [[x, y], …].
--   distributionHeightInches  NULL = drawn, no height yet → follows the
--                             sheet. Never 0 for unset. No DEFAULT.
--
-- Chain (code): homerun's own → height area → sheet → job → company.
--
-- ── ADDITIVE. STEP 1 ─────────────────────────────────────────────────────────
-- Pairing rule: as 0125. Hand-written, not generated.
CREATE TABLE `bid_height_areas` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bidId` int NOT NULL,
	`userId` int NOT NULL,
	`sheetId` int NOT NULL,
	`name` varchar(64) NOT NULL,
	`region` json NOT NULL,
	`distributionHeightInches` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bid_height_areas_id` PRIMARY KEY(`id`),
	CONSTRAINT `bid_height_areas_bidId_bids_id_fk` FOREIGN KEY (`bidId`) REFERENCES `bids`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_height_areas_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_height_areas_sheetId_bid_pdf_sheets_id_fk` FOREIGN KEY (`sheetId`) REFERENCES `bid_pdf_sheets`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `bid_height_areas_userId_sheetId_idx` ON `bid_height_areas` (`userId`,`sheetId`);
