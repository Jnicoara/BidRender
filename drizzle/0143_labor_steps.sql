-- 0143 — LABOR STEPS: build an assembly's hours from shared work steps
-- (2026-10-09; references/step-based-labor-plan.md, Track C's c-step-labor).
-- PROPOSED by Track C; Track A owns the number and runs it (renumber freely
-- if another file takes 0143 first — nothing reads the number). Renumbered
-- from 0142 on 2026-10-10: A's 0142_search_misses took that number.
--
--   labor_steps            the shared step library, the materials pattern:
--                          userId NULL = shipped (re-stamped from
--                          server/seed/starterLaborSteps.ts), a shop's edit
--                          forks it (userId, baselineId).
--     minutes              per ONE count; NULL = NOT SET, never 0.
--     isExampleMinutes     TRUE on a shipped time from the owner's sheet.
--   assembly_labor_steps   an assembly's step list: kind 'step' (a library
--                          step × count) or 'cable' (the recipe's foot-sold
--                          lines at their own labor units, owner Q1).
--
-- ── ADDITIVE. STEP 1. SAFE BEFORE OR AFTER THE CODE ─────────────────────────
-- Two new tables; nothing existing changes, no number moves. The code that
-- reads them treats "table missing" as "no steps", so it runs on a database
-- without them too — but schemaCheck reports the drift until this runs.
--
-- Hand-written, not generated (CLAUDE.md: never run generated output unread).
CREATE TABLE `labor_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`baselineId` int,
	`stepKey` varchar(32),
	`name` varchar(255) NOT NULL,
	`unit` varchar(64) NOT NULL DEFAULT 'each',
	`minutes` decimal(8,2),
	`reasoning` text,
	`isExampleMinutes` boolean,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `labor_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `labor_steps_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `labor_steps_userId_idx` ON `labor_steps` (`userId`);
--> statement-breakpoint
CREATE INDEX `labor_steps_baselineId_idx` ON `labor_steps` (`baselineId`);
--> statement-breakpoint
CREATE TABLE `assembly_labor_steps` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assemblyId` int NOT NULL,
	`kind` enum('step','cable') NOT NULL DEFAULT 'step',
	`laborStepId` int,
	`count` decimal(10,2) NOT NULL DEFAULT '1',
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `assembly_labor_steps_id` PRIMARY KEY(`id`),
	CONSTRAINT `assembly_labor_steps_assemblyId_assemblies_id_fk` FOREIGN KEY (`assemblyId`) REFERENCES `assemblies`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `assembly_labor_steps_laborStepId_labor_steps_id_fk` FOREIGN KEY (`laborStepId`) REFERENCES `labor_steps`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `assembly_labor_steps_assemblyId_idx` ON `assembly_labor_steps` (`assemblyId`);
