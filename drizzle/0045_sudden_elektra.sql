CREATE TABLE `ai_usage_daily` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`day` varchar(10) NOT NULL,
	`feature` varchar(40) NOT NULL,
	`model` varchar(80) NOT NULL,
	`calls` int NOT NULL DEFAULT 0,
	`inputTokens` bigint NOT NULL DEFAULT 0,
	`outputTokens` bigint NOT NULL DEFAULT 0,
	`costMicros` bigint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `ai_usage_daily_id` PRIMARY KEY(`id`),
	CONSTRAINT `ai_usage_daily_unique` UNIQUE(`userId`,`day`,`feature`,`model`)
);
--> statement-breakpoint
ALTER TABLE `ai_usage_daily` ADD CONSTRAINT `ai_usage_daily_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `ai_usage_daily_user_day_idx` ON `ai_usage_daily` (`userId`,`day`);--> statement-breakpoint
CREATE INDEX `ai_usage_daily_day_idx` ON `ai_usage_daily` (`day`);