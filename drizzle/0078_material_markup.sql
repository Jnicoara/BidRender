-- Material markup, Piece 1: the rules table, the company default, and the
-- markup frozen on each bid line (references/material-markup.md).
--
-- ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE. One new table and three new
-- NULLABLE columns with NO default. No UPDATE, nothing existing touched.
-- **Step 3 is empty.**
--
-- ── Why no default on the bid-line columns ──────────────────────────────────
-- NULL `snapshotMarkupPct` is "added before markup rules" and the code prices
-- it as 0% — so every existing line reads exactly as it did, to the cent, with
-- no backfill. A DEFAULT 0 would erase the difference between that and a line
-- whose rules deliberately came to 0%, which the bid line says differently
-- ("added before markup rules" against "no markup rule set"). CLAUDE.md §
-- "Deploying a migration: THREE STEPS" — "not yet migrated" must be a value
-- nothing else can produce.
--
-- The same for `pricing_defaults.materialMarkupPct`: NULL is "no company
-- default set", which is not a 0% rule.
--
-- COLLATE on the table because drizzle cannot declare it and every string
-- column here is utf8mb4_unicode_ci (references/deploying.md).
CREATE TABLE `markup_rules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`kind` enum('item','category','band') NOT NULL,
	`itemKey` int,
	`category` varchar(128),
	`bandMinPrice` decimal(12,2),
	`bandMaxPrice` decimal(12,2),
	`markupPct` decimal(10,6) NOT NULL,
	`isStarter` boolean NOT NULL DEFAULT false,
	`starterDate` date,
	`acceptedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `markup_rules_id` PRIMARY KEY(`id`),
	CONSTRAINT `markup_rules_user_kind_item_uq` UNIQUE(`userId`,`kind`,`itemKey`),
	CONSTRAINT `markup_rules_user_kind_category_uq` UNIQUE(`userId`,`kind`,`category`),
	CONSTRAINT `markup_rules_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	INDEX `markup_rules_userId_idx` (`userId`)
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
ALTER TABLE `pricing_defaults` ADD `materialMarkupPct` decimal(10,6);
--> statement-breakpoint
ALTER TABLE `bid_line_items` ADD `snapshotMarkupPct` decimal(10,6);
--> statement-breakpoint
ALTER TABLE `bid_line_items` ADD `snapshotMarkupSource` json;
