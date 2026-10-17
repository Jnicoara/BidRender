ALTER TABLE `takeoff_stamps` ADD `clientKey` varchar(64);--> statement-breakpoint
ALTER TABLE `takeoff_stamps` ADD CONSTRAINT `takeoff_stamps_bid_clientKey_uq` UNIQUE(`bidId`,`clientKey`);