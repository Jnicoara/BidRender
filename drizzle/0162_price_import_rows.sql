-- 0162 — WHAT EACH IMPORTED ROW REPLACED (2026-10-14; Track C's PS-M6, word
-- for word from references/pricing-safety-plan.md § 6). Track A owns the
-- number.
--
--   price_import_rows   one row per material a price import wrote.
--     materialId        the company's own row the import wrote (the fork) —
--                       "the row itself", never resolved through a baseline.
--     replaced*         what the import overwrote, for undo.
--     writtenCostPerUnit   what the import wrote, so undo only restores rows
--                       nobody has edited since.
--     madeFork          the import created the company's copy.
--
-- ── ADDITIVE. STEP 1. SAFE BEFORE THE CODE ─────────────────────────────────
-- A new table. No UPDATE, no existing table changed, nothing reads it until
-- C's import undo ships, no number moves. Step 3 is EMPTY.
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
CREATE TABLE `price_import_rows` (
	`id` int AUTO_INCREMENT NOT NULL,
	`importId` int NOT NULL,
	`materialId` int NOT NULL,
	`replacedCostPerUnit` decimal(10,4) NOT NULL,
	`replacedPackPrice` decimal(12,4) NULL,
	`replacedSupplierName` varchar(128) NULL,
	`replacedPriceUpdatedAt` timestamp NULL,
	`replacedIsExamplePrice` boolean NULL,
	`writtenCostPerUnit` decimal(10,4) NOT NULL,
	`madeFork` boolean NOT NULL,
	CONSTRAINT `price_import_rows_id` PRIMARY KEY(`id`),
	CONSTRAINT `price_import_rows_importId_price_imports_id_fk` FOREIGN KEY (`importId`) REFERENCES `price_imports`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `price_import_rows_materialId_materials_id_fk` FOREIGN KEY (`materialId`) REFERENCES `materials`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `price_import_rows_importId_idx` ON `price_import_rows` (`importId`);
