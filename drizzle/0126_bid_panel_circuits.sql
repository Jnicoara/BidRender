-- One circuit of a panel (clash 5: replaces Track C's proposed
-- `panel_circuits`), with its HOMERUN (Track C, homerun-footage-plan.md § 6,
-- § 9; todo.md "Homerun footage"). The schedule columns follow what Track C's
-- reader already produces (`PanelCircuit`, client/src/lib/panelSchedules.ts
-- on track-c): number, breaker as printed, amps, poles, wire, description,
-- load in kVA.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- A new table. Every homerun column is NULL = "not said, follow the level
-- above", no DEFAULT, never 0 for unset:
--   homerunOverrideFt     a typed length (replaces L + V). NULL = computed.
--   homerunFromStampId    the leaving device when not the closest. NULL =
--                         closest. SET NULL: deleting the mark falls back.
--   homerunConfirmedAt    NULL = unconfirmed, how every homerun starts.
--   homerunCeilingInches  this homerun's own ceiling (owner, 2026-10-06:
--                         "make overriding a homerun's height quick and
--                         obvious"). NULL = follows the height area, then the
--                         sheet, job, company (plan § 4).
--
-- No unique key on (panelId, circuitNumber): how a 2-pole circuit reads off a
-- schedule (one row "14" or two) is the reader's, not settled here.
--
-- Pairing rule: as 0125. Hand-written, not generated.
CREATE TABLE `bid_panel_circuits` (
	`id` int AUTO_INCREMENT NOT NULL,
	`panelId` int NOT NULL,
	`userId` int NOT NULL,
	`circuitNumber` int NOT NULL,
	`breaker` varchar(16),
	`amps` int,
	`poles` int,
	`wire` varchar(16),
	`description` varchar(255),
	`loadKva` decimal(10,3),
	`homerunOverrideFt` decimal(8,2),
	`homerunFromStampId` int,
	`homerunConfirmedAt` timestamp NULL,
	`homerunCeilingInches` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bid_panel_circuits_id` PRIMARY KEY(`id`),
	CONSTRAINT `bid_panel_circuits_panelId_bid_panels_id_fk` FOREIGN KEY (`panelId`) REFERENCES `bid_panels`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_panel_circuits_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_panel_circuits_homerunFromStampId_takeoff_stamps_id_fk` FOREIGN KEY (`homerunFromStampId`) REFERENCES `takeoff_stamps`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
--> statement-breakpoint
CREATE INDEX `bid_panel_circuits_userId_idx` ON `bid_panel_circuits` (`userId`);
