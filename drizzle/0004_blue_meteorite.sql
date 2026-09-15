CREATE TABLE `bid_summary` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`percentageLaborFactor` decimal(6,4) NOT NULL DEFAULT '1.0000',
	`lumpSumHours` decimal(10,4) NOT NULL DEFAULT '0',
	`markupPct` decimal(6,4) NOT NULL DEFAULT '0',
	`defaultLaborRateId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bid_summary_id` PRIMARY KEY(`id`),
	CONSTRAINT `bid_summary_projectId_unique` UNIQUE(`projectId`)
);
--> statement-breakpoint
CREATE TABLE `master_assemblies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`description` text,
	`phase` varchar(128),
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `master_assemblies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `master_assembly_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`assemblyId` int NOT NULL,
	`masterItemId` int NOT NULL,
	`qty` decimal(10,4) NOT NULL DEFAULT '1',
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `master_assembly_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `master_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`itemCode` varchar(128),
	`category` varchar(128),
	`description` varchar(512) NOT NULL,
	`unit` varchar(32) NOT NULL DEFAULT 'EA',
	`masterMaterialCost` decimal(10,4) NOT NULL DEFAULT '0',
	`masterLaborHours` decimal(10,4) NOT NULL DEFAULT '0',
	`notes` text,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `master_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `master_labor_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(128) NOT NULL,
	`ratePerHour` decimal(10,4) NOT NULL DEFAULT '0',
	`type` enum('journeyman','apprentice','foreman') NOT NULL DEFAULT 'journeyman',
	`isDefault` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `master_labor_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_assemblies` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`masterAssemblyId` int,
	`name` varchar(255) NOT NULL,
	`phase` varchar(128),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_assemblies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_assembly_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectAssemblyId` int NOT NULL,
	`masterItemId` int,
	`itemCode` varchar(128),
	`description` varchar(512) NOT NULL,
	`unit` varchar(32) NOT NULL DEFAULT 'EA',
	`qty` decimal(10,4) NOT NULL DEFAULT '1',
	`masterMaterialCost` decimal(10,4) NOT NULL DEFAULT '0',
	`masterLaborHours` decimal(10,4) NOT NULL DEFAULT '0',
	`overrideMaterialCost` decimal(10,4) NOT NULL DEFAULT '0',
	`overrideLaborHours` decimal(10,4) NOT NULL DEFAULT '0',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_assembly_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `project_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`projectId` int NOT NULL,
	`masterItemId` int,
	`itemCode` varchar(128),
	`description` varchar(512) NOT NULL,
	`unit` varchar(32) NOT NULL DEFAULT 'EA',
	`qty` decimal(10,4) NOT NULL DEFAULT '1',
	`phase` varchar(128),
	`masterMaterialCost` decimal(10,4) NOT NULL DEFAULT '0',
	`masterLaborHours` decimal(10,4) NOT NULL DEFAULT '0',
	`overrideMaterialCost` decimal(10,4) NOT NULL DEFAULT '0',
	`overrideLaborHours` decimal(10,4) NOT NULL DEFAULT '0',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `project_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `customerName` varchar(255);--> statement-breakpoint
ALTER TABLE `projects` ADD `address` varchar(512);--> statement-breakpoint
ALTER TABLE `projects` ADD `bidDate` date;--> statement-breakpoint
ALTER TABLE `projects` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `status` enum('Bidding','Won','In Progress','Lost') DEFAULT 'Bidding' NOT NULL;--> statement-breakpoint
ALTER TABLE `bid_summary` ADD CONSTRAINT `bid_summary_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bid_summary` ADD CONSTRAINT `bid_summary_defaultLaborRateId_master_labor_rates_id_fk` FOREIGN KEY (`defaultLaborRateId`) REFERENCES `master_labor_rates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_assemblies` ADD CONSTRAINT `master_assemblies_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_assembly_items` ADD CONSTRAINT `master_assembly_items_assemblyId_master_assemblies_id_fk` FOREIGN KEY (`assemblyId`) REFERENCES `master_assemblies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_assembly_items` ADD CONSTRAINT `master_assembly_items_masterItemId_master_items_id_fk` FOREIGN KEY (`masterItemId`) REFERENCES `master_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_items` ADD CONSTRAINT `master_items_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `master_labor_rates` ADD CONSTRAINT `master_labor_rates_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_assemblies` ADD CONSTRAINT `project_assemblies_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_assemblies` ADD CONSTRAINT `project_assemblies_masterAssemblyId_master_assemblies_id_fk` FOREIGN KEY (`masterAssemblyId`) REFERENCES `master_assemblies`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Named by hand. drizzle-kit's generated name for this constraint is 65
-- characters and MySQL allows 64 (error 1059), so every new database stopped
-- here. drizzle/schema.ts and the snapshots keep the generated name on
-- purpose: changing it there would make drizzle-kit generate a rename that
-- fails on every existing database, which has either this short name or, on
-- the live one, no such constraint at all. See server/migrationRun.ts.
ALTER TABLE `project_assembly_items` ADD CONSTRAINT `project_assembly_items_projectAssemblyId_fk` FOREIGN KEY (`projectAssemblyId`) REFERENCES `project_assemblies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_assembly_items` ADD CONSTRAINT `project_assembly_items_masterItemId_master_items_id_fk` FOREIGN KEY (`masterItemId`) REFERENCES `master_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_items` ADD CONSTRAINT `project_items_projectId_projects_id_fk` FOREIGN KEY (`projectId`) REFERENCES `projects`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `project_items` ADD CONSTRAINT `project_items_masterItemId_master_items_id_fk` FOREIGN KEY (`masterItemId`) REFERENCES `master_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `master_assemblies_userId_idx` ON `master_assemblies` (`userId`);--> statement-breakpoint
CREATE INDEX `master_assembly_items_assemblyId_idx` ON `master_assembly_items` (`assemblyId`);--> statement-breakpoint
CREATE INDEX `master_assembly_items_masterItemId_idx` ON `master_assembly_items` (`masterItemId`);--> statement-breakpoint
CREATE INDEX `master_items_userId_idx` ON `master_items` (`userId`);--> statement-breakpoint
CREATE INDEX `master_items_category_idx` ON `master_items` (`category`);--> statement-breakpoint
CREATE INDEX `master_labor_rates_userId_idx` ON `master_labor_rates` (`userId`);--> statement-breakpoint
CREATE INDEX `project_assemblies_projectId_idx` ON `project_assemblies` (`projectId`);--> statement-breakpoint
CREATE INDEX `project_assembly_items_assemblyId_idx` ON `project_assembly_items` (`projectAssemblyId`);--> statement-breakpoint
CREATE INDEX `project_items_projectId_idx` ON `project_items` (`projectId`);