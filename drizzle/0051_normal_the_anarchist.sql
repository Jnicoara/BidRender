-- The stamp at a run's START end, once the estimator has linked the two.
--
-- One statement: the column and its foreign key in a single ALTER — see 0046.
--
-- THIS COLUMN IS THE DOUBLE-COUNT RULE. A vertical belongs to either the run or
-- the stamp and never both: a stamp a run claims does not carry its own drop,
-- because the run already counted it. Without the link there is no way to know
-- the two are the same device except by how close they happen to sit, and
-- deciding it by proximity is right most of the time and silently wrong the
-- rest — with nothing on screen looking wrong, because a doubled vertical just
-- makes the total bigger, which is what verticals are expected to do.
--
-- ON DELETE SET NULL, never cascade: deleting a stamp must not delete the run.
-- The run keeps its own end kind and goes on counting its drop.
--
-- Kept in its own migration rather than folded into 0050 because it carries a
-- foreign key, and a foreign key is the statement most likely to fail here —
-- MySQL validates it against every existing row, and this database is already
-- missing five foreign keys from the 0004 incident.
ALTER TABLE `takeoff_runs`
	ADD `startStampId` int,
	ADD CONSTRAINT `takeoff_runs_startStampId_takeoff_stamps_id_fk` FOREIGN KEY (`startStampId`) REFERENCES `takeoff_stamps`(`id`) ON DELETE set null ON UPDATE no action;
