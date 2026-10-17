CREATE TABLE `scope_prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`baselineId` int,
	`shippedKey` varchar(64),
	`name` varchar(255) NOT NULL,
	`matchWords` varchar(2048) NOT NULL,
	`notWords` varchar(1024) NOT NULL DEFAULT '',
	`matchCategories` varchar(1024) NOT NULL DEFAULT '',
	`isActive` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scope_prompts_id` PRIMARY KEY(`id`),
	CONSTRAINT `scope_prompts_shippedKey_unique` UNIQUE(`shippedKey`),
	CONSTRAINT `scope_prompts_user_baseline_unique` UNIQUE(`userId`,`baselineId`)
);
--> statement-breakpoint
ALTER TABLE `scope_prompts` ADD CONSTRAINT `scope_prompts_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `scope_prompts_baselineId_idx` ON `scope_prompts` (`baselineId`);