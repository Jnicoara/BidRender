-- 0161 — ONE ROW PER PRICE IMPORT, FOR UNDO (2026-10-14; Track C's PS-M5,
-- word for word from references/pricing-safety-plan.md § 6). Track A owns the
-- number.
--
--   price_imports   one supplier price file applied. Multi-supplier later ADDS
--                   a nullable supplierId here instead of creating
--                   supplier_price_imports (multi-supplier-plan.md § 6).
--     userId        the company owner (scope), cascade like every table.
--     priceAsOf     the date on the supplier's sheet, asked once (PS § 3.3).
--     undoneAt      NULL = not undone.
--
-- ── ADDITIVE. STEP 1. SAFE BEFORE THE CODE ─────────────────────────────────
-- A new table. No UPDATE, no existing table changed, nothing reads it until
-- C's import preview/undo ships (the import button stays hidden until then,
-- PS Q10), no number moves. Step 3 is EMPTY.
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
CREATE TABLE `price_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`supplierName` varchar(128) NULL,
	`fileName` varchar(255) NULL,
	`priceAsOf` date NOT NULL,
	`rowsChanged` int NOT NULL,
	`undoneAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `price_imports_id` PRIMARY KEY(`id`),
	CONSTRAINT `price_imports_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `price_imports_userId_idx` ON `price_imports` (`userId`);
