-- 0163 — MATERIAL PRICE HISTORY (2026-10-14; Track C's PH-M1, word for word
-- from references/price-history-plan.md § 6, track-c a2c8ac8f). Track A owns
-- the number. Recording only — no screen reads it yet.
--
--   material_price_history   INSERT-ONLY: one row per change of a COMPANY's
--                            material price. No updatedAt on purpose. Shared
--                            (shipped) rows are NOT here: their history is
--                            starter_changes (PH plan § 3.4).
--     userId            company owner (scope), never the actor.
--     materialKey       materialItemKey: baselineId ?? id. The history reads
--                       by this, so a fork never splits one item's history.
--     materialId        the row written. NULL = that row was deleted forever.
--     unitOfSale        enum copying MATERIAL_UNITS_OF_SALE (A's pick of the
--                       two C offered): schema.ts declares it from the same
--                       const, so adding a unit there without moving this
--                       enum shows up as schema drift rather than a silent
--                       insert failure. A unit added later moves both in one
--                       batch.
--     changedByUserId   the person. NULL = user removed.
--     importId          imported / import_undone only (needs 0161).
--     starterChangeId   starter_accepted only.
--
-- Comes AFTER 0157-0162: it points at price_imports and records the pack
-- columns.
--
-- ── ADDITIVE. STEP 1. SAFE BEFORE THE CODE ─────────────────────────────────
-- A new table. No UPDATE, no existing table changed, nothing writes or reads
-- it until C's price door ships, no number moves. Step 3 is EMPTY.
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
CREATE TABLE `material_price_history` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`materialKey` int NOT NULL,
	`materialId` int NULL,
	`unitCost` decimal(12,4) NOT NULL,
	`previousUnitCost` decimal(12,4) NULL,
	`unitOfSale` enum('each','foot','box') NOT NULL,
	`packQty` decimal(10,4) NULL,
	`packLabel` varchar(32) NULL,
	`packPrice` decimal(12,4) NULL,
	`supplierName` varchar(128) NULL,
	`priceAsOf` date NULL,
	`source` enum('typed','imported','import_undone','starter_accepted') NOT NULL,
	`isExamplePrice` boolean NOT NULL,
	`changedByUserId` int NULL,
	`importId` int NULL,
	`starterChangeId` int NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `material_price_history_id` PRIMARY KEY(`id`),
	CONSTRAINT `material_price_history_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `material_price_history_materialKey_materials_id_fk` FOREIGN KEY (`materialKey`) REFERENCES `materials`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `material_price_history_materialId_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `material_price_history_changedByUserId_users_id_fk` FOREIGN KEY (`changedByUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `material_price_history_importId_price_imports_id_fk` FOREIGN KEY (`importId`) REFERENCES `price_imports`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `material_price_history_starterChangeId_starter_changes_id_fk` FOREIGN KEY (`starterChangeId`) REFERENCES `starter_changes`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `material_price_history_key_idx` ON `material_price_history` (`userId`,`materialKey`,`createdAt`,`id`);
