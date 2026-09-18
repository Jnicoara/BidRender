-- One job's mounting heights, where the job does not match the company's.
--
-- One statement: both foreign keys and the index are inline — see 0046.
--
-- A row exists only for a type actually overridden on this bid. Absent means
-- "follow the company", never "set to nothing", which is the same inheritance
-- rule the per-bid pricing overrides already use: nothing is copied down, so
-- changing a company height still re-prices every job that has not overridden
-- it.
--
-- `heightInches` is NOT NULL here, unlike on the company table. A row here IS
-- an override, so it always carries a number; "no override" is expressed by the
-- row not existing.
--
-- `userId` is denormalised alongside `bidId` for one-query ownership checks, as
-- on bid_pdfs, and the rows cascade away with the bid.
CREATE TABLE `bid_mounting_heights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bidId` int NOT NULL,
	`userId` int NOT NULL,
	`typeKey` varchar(64) NOT NULL,
	`heightInches` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bid_mounting_heights_id` PRIMARY KEY(`id`),
	CONSTRAINT `bid_mounting_heights_bid_type_uq` UNIQUE(`bidId`,`typeKey`),
	KEY `bid_mounting_heights_userId_idx` (`userId`),
	CONSTRAINT `bid_mounting_heights_bidId_bids_id_fk` FOREIGN KEY (`bidId`) REFERENCES `bids`(`id`) ON DELETE cascade ON UPDATE no action,
	CONSTRAINT `bid_mounting_heights_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
);
