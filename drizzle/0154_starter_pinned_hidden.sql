-- 0154 — PINNED COPIES, HIDDEN AND REPLACED STARTER ROWS (2026-10-13; Track
-- C's BS-M5, references/baseline-screen-plan.md § 10a.2, with its "the same
-- four statements for …" written out). Track A owns the number.
--
-- On the FIVE tables a starter change covers (§ 10a.1 #1): materials,
-- assemblies, labor_rates, modifiers, takeoff_run_types.
--
--   isPinnedCopy   NULL  = a company's own copy — today's meaning, and every
--                          existing row. Nothing is backfilled.
--                  TRUE  = a pin: mirrors the starter as it was.
--                  FALSE = was a pin, then the company edited it.
--   hiddenAt       shared rows only, enforced in code (hideStarterItem).
--   replacedById   self-FK ON DELETE set null; shared rows only, enforced in
--                  code. Rows are retired, never deleted, so set null is a
--                  backstop.
--
-- ── ADDITIVE. STEP 1. SAFE BEFORE THE CODE ─────────────────────────────────
-- Fifteen nullable columns with no default, five FKs. No UPDATE, nothing
-- reads them until C's code ships, no number moves. Step 3 is EMPTY.
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
ALTER TABLE `materials` ADD `isPinnedCopy` boolean NULL;
--> statement-breakpoint
ALTER TABLE `materials` ADD `hiddenAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `materials` ADD `replacedById` int NULL;
--> statement-breakpoint
ALTER TABLE `materials` ADD CONSTRAINT `materials_replacedById_materials_id_fk` FOREIGN KEY (`replacedById`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `assemblies` ADD `isPinnedCopy` boolean NULL;
--> statement-breakpoint
ALTER TABLE `assemblies` ADD `hiddenAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `assemblies` ADD `replacedById` int NULL;
--> statement-breakpoint
ALTER TABLE `assemblies` ADD CONSTRAINT `assemblies_replacedById_assemblies_id_fk` FOREIGN KEY (`replacedById`) REFERENCES `assemblies`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `labor_rates` ADD `isPinnedCopy` boolean NULL;
--> statement-breakpoint
ALTER TABLE `labor_rates` ADD `hiddenAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `labor_rates` ADD `replacedById` int NULL;
--> statement-breakpoint
ALTER TABLE `labor_rates` ADD CONSTRAINT `labor_rates_replacedById_labor_rates_id_fk` FOREIGN KEY (`replacedById`) REFERENCES `labor_rates`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `modifiers` ADD `isPinnedCopy` boolean NULL;
--> statement-breakpoint
ALTER TABLE `modifiers` ADD `hiddenAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `modifiers` ADD `replacedById` int NULL;
--> statement-breakpoint
ALTER TABLE `modifiers` ADD CONSTRAINT `modifiers_replacedById_modifiers_id_fk` FOREIGN KEY (`replacedById`) REFERENCES `modifiers`(`id`) ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `takeoff_run_types` ADD `isPinnedCopy` boolean NULL;
--> statement-breakpoint
ALTER TABLE `takeoff_run_types` ADD `hiddenAt` timestamp NULL;
--> statement-breakpoint
ALTER TABLE `takeoff_run_types` ADD `replacedById` int NULL;
--> statement-breakpoint
ALTER TABLE `takeoff_run_types` ADD CONSTRAINT `takeoff_run_types_replacedById_takeoff_run_types_id_fk` FOREIGN KEY (`replacedById`) REFERENCES `takeoff_run_types`(`id`) ON DELETE set null ON UPDATE no action;
