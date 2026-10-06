-- A supplier quote on a bid (Track B's quote items, owner-answered;
-- quote-items-plan.md § 8). 0115's `bid_line_items.quoteId` points here, so
-- this comes first.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
--   packagePrice      NULL = a per-item quote; set = a package price.
--   carriedFromBidId  provenance only, NO foreign key: the old bid may be
--                     deleted and the quote must survive it.
--
-- Track A's picks where § 8 left it open (2026-10-06), all house convention:
-- bidId NOT NULL; userId (the company owner, as everywhere) NOT NULL with an
-- FK to users ON DELETE CASCADE; createdAt / updatedAt as on every table.
--
-- Hand-written, not generated.
CREATE TABLE `bid_quotes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bidId` int NOT NULL,
	`userId` int NOT NULL,
	`supplierName` varchar(128),
	`quotedOn` date,
	`packagePrice` decimal(12,2),
	`carriedFromBidId` int,
	`note` varchar(500),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bid_quotes_id` PRIMARY KEY(`id`),
	CONSTRAINT `bid_quotes_bidId_bids_id_fk` FOREIGN KEY (`bidId`) REFERENCES `bids`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_quotes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `bid_quotes_userId_bidId_idx` ON `bid_quotes` (`userId`,`bidId`);
