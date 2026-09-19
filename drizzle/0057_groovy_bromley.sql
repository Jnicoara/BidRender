-- The run type: a kind of run, defined once and reused on every job.
--
-- ONE STATEMENT PER FILE, as 0046–0056 established. drizzle-kit generated this
-- as seven statements; the foreign keys and indexes are folded INLINE here by
-- hand, which is safe because drizzle never compares a file's contents against
-- what a database ran (references/deploying.md § 5). The constraint NAMES are
-- drizzle's own, unchanged, so a fresh database and an existing one agree.
--
-- COLLATE is named explicitly. Every table in this schema is
-- utf8mb4_unicode_ci while the DATABASE default is utf8mb4_0900_ai_ci, so a
-- CREATE TABLE that says nothing lands on the other one — invisible until a
-- string column of a new table is compared with a string column of an old one,
-- which then fails outright. 0055 hit exactly that in rehearsal. See
-- references/deploying.md § "A new table lands on the WRONG collation".
--
-- ── Why userId is NULLABLE ───────────────────────────────────────────────────
-- NULL is an app-owned row, shared by every contractor and re-stamped from the
-- seed on startup; a set userId is that contractor's own fork. Same flag the
-- material catalog uses, and the reason it is a flag rather than a second table
-- is in CLAUDE.md § "Customization available, but never in the way": one path,
-- so a user's own row cannot start lagging a shipped one in small ways.
--
-- ── This table ships EMPTY, and the seed fills it ────────────────────────────
-- No row here means the palette is empty and every existing run keeps behaving
-- exactly as it does today: 0059 gives each user one type per path type from
-- what their runs already say, and nothing about a traced length, a footage or
-- a total changes. A run's specification is new information, not a restatement
-- of something the database already held.
CREATE TABLE `takeoff_run_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`baselineId` int,
	`baselineVersion` int,
	`version` int NOT NULL DEFAULT 1,
	`label` varchar(255) NOT NULL,
	`pathType` enum('conduit','cable') NOT NULL,
	`trade` varchar(64) NOT NULL DEFAULT 'electrical',
	`racewayMaterialId` int,
	`conductorMaterialId` int,
	`conductorCount` int,
	`status` enum('active','archived','deleted') NOT NULL DEFAULT 'active',
	`archivedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `takeoff_run_types_id` PRIMARY KEY(`id`),
	CONSTRAINT `takeoff_run_types_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `takeoff_run_types_racewayMaterialId_materials_id_fk` FOREIGN KEY (`racewayMaterialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action,
	CONSTRAINT `takeoff_run_types_conductorMaterialId_materials_id_fk` FOREIGN KEY (`conductorMaterialId`) REFERENCES `materials`(`id`) ON DELETE set null ON UPDATE no action,
	INDEX `takeoff_run_types_userId_idx` (`userId`),
	INDEX `takeoff_run_types_status_idx` (`status`),
	INDEX `takeoff_run_types_trade_idx` (`trade`)
) COLLATE=utf8mb4_unicode_ci;
