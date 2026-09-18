-- The stamp at a run's END end. The mirror of 0051, and separate from it for
-- the same reason: one foreign key per statement, so a failure names exactly
-- one thing and leaves nothing half-applied.
ALTER TABLE `takeoff_runs`
	ADD `endStampId` int,
	ADD CONSTRAINT `takeoff_runs_endStampId_takeoff_stamps_id_fk` FOREIGN KEY (`endStampId`) REFERENCES `takeoff_stamps`(`id`) ON DELETE set null ON UPDATE no action;
