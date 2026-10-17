CREATE TABLE `wage_rate_set_rates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`setId` int NOT NULL,
	`classification` enum('journeyman','apprentice','trainee','other') NOT NULL,
	`label` varchar(255) NOT NULL,
	`laborRateId` int,
	`baseWage` decimal(10,4) NOT NULL,
	`fringe` decimal(10,4) NOT NULL,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `wage_rate_set_rates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `wage_rate_sets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`wageDeterminationNumber` varchar(128),
	`dateSet` date NOT NULL,
	`archivedAt` timestamp,
	`fringePaidAsCash` boolean,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `wage_rate_sets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `bid_line_items` ADD `snapshotChargeRate` decimal(10,4);--> statement-breakpoint
ALTER TABLE `bids` ADD `pricingMethod` enum('markup_rate','cost_op');--> statement-breakpoint
ALTER TABLE `bids` ADD `wageRateSetId` int;--> statement-breakpoint
ALTER TABLE `bids` ADD `registeredApprentices` boolean;--> statement-breakpoint
ALTER TABLE `bids` ADD `buildingSqFt` decimal(12,2);--> statement-breakpoint
ALTER TABLE `labor_rates` ADD `chargeRate` decimal(10,4);--> statement-breakpoint
ALTER TABLE `pricing_defaults` ADD `pricingMethod` enum('markup_rate','cost_op');--> statement-breakpoint
ALTER TABLE `pricing_defaults` ADD `materialMarkupMode` enum('flat','brackets');--> statement-breakpoint
ALTER TABLE `wage_rate_set_rates` ADD CONSTRAINT `wage_rate_set_rates_setId_wage_rate_sets_id_fk` FOREIGN KEY (`setId`) REFERENCES `wage_rate_sets`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wage_rate_set_rates` ADD CONSTRAINT `wage_rate_set_rates_laborRateId_labor_rates_id_fk` FOREIGN KEY (`laborRateId`) REFERENCES `labor_rates`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `wage_rate_sets` ADD CONSTRAINT `wage_rate_sets_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `bids` ADD CONSTRAINT `bids_wageRateSetId_wage_rate_sets_id_fk` FOREIGN KEY (`wageRateSetId`) REFERENCES `wage_rate_sets`(`id`) ON DELETE set null ON UPDATE no action;