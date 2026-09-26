-- Pricing problem reports: one row per thing on a bid the engine could not
-- price, whose id is the ERR- reference shown on screen
-- (shared/linePricingProblems.ts, server/bidPricing.ts).
--
-- ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE. One new table. No UPDATE, no
-- existing column touched. **Step 3 is empty.**
--
-- Old code never reads this table, so it is safe to apply ahead of the deploy.
-- New code writes it on read; if it were missing, recording fails inside a
-- try/catch and the bid still shows its problems, only without a reference —
-- but the order above is still the order.
--
-- COLLATE on the table because drizzle cannot declare it and every string
-- column here is utf8mb4_unicode_ci (references/deploying.md).
CREATE TABLE `pricing_problem_reports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`bidId` int NOT NULL,
	`lineId` int,
	`code` varchar(64) NOT NULL,
	`detail` varchar(500) NOT NULL,
	`dedupeKey` varchar(128) NOT NULL,
	`occurrences` int NOT NULL DEFAULT 1,
	`firstSeenAt` timestamp NOT NULL DEFAULT (now()),
	`lastSeenAt` timestamp NOT NULL DEFAULT (now()),
	`resolvedAt` timestamp,
	CONSTRAINT `pricing_problem_reports_id` PRIMARY KEY(`id`),
	CONSTRAINT `pricing_problem_reports_dedupe_uq` UNIQUE(`dedupeKey`),
	CONSTRAINT `pricing_problem_reports_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `pricing_problem_reports_bidId_bids_id_fk` FOREIGN KEY (`bidId`) REFERENCES `bids`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `pricing_problem_reports_lineId_bid_line_items_id_fk` FOREIGN KEY (`lineId`) REFERENCES `bid_line_items`(`id`) ON DELETE cascade ON UPDATE no action,
	INDEX `pricing_problem_reports_bid_idx` (`bidId`),
	INDEX `pricing_problem_reports_lastSeen_idx` (`lastSeenAt`)
) COLLATE=utf8mb4_unicode_ci;
