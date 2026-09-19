-- Point each mark at what it is counting.
--
-- One statement — see 0053. The column, its foreign key and its index go in a
-- single ALTER because MySQL applies them together or not at all, which is the
-- property the one-statement rule is really after.
--
-- NULLABLE, and it has to be: the column arrives before 0055 fills it, and a
-- NOT NULL column cannot be added to a table that already has rows without a
-- default that would be a lie. After 0055 every mark has a group; the column
-- stays nullable because the alternative is a third migration to tighten it,
-- on a live table, to enforce something the code already guarantees.
--
-- CASCADE on delete, unlike the provenance keys in 0053: deleting a group IS
-- deleting the count. Fourteen orphan marks on a drawing with nothing to say
-- what they are would be worse than removing them, and the screen asks first.
ALTER TABLE `takeoff_stamps`
	ADD `groupId` int,
	ADD CONSTRAINT `takeoff_stamps_groupId_takeoff_groups_id_fk` FOREIGN KEY (`groupId`) REFERENCES `takeoff_groups`(`id`) ON DELETE cascade ON UPDATE no action,
	ADD INDEX `takeoff_stamps_groupId_idx` (`groupId`);
