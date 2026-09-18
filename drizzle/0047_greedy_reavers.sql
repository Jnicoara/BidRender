-- A company's own mounting heights: overrides of the shipped types, types they
-- added themselves, and types they have retired.
--
-- One statement, foreign key inline — see 0046 for why every file in this run
-- is exactly one statement.
--
-- `userId` is NOT NULL on purpose. The shipped types are not rows here at all;
-- they live in SHIPPED_HEIGHT_TYPES in shared/takeoffHeights.ts and are the
-- last layer of the resolver. Had app-owned rows been stored with a NULL owner
-- — the pattern baseline materials use — the unique index below would not have
-- protected them, because MySQL ignores NULLs in a unique index. That is the
-- hole `dedupeBaselineRows` exists to plug for materials, and this table does
-- not have it.
--
-- `heightInches` is nullable because "no height set" is a real state a type can
-- be in, and it is NOT the same as zero: a floor box at 0" is a correct answer,
-- and a panel with no height is a question nobody has answered. The screen
-- shows the second as "not set — no vertical counted", never as 0'-0".
--
-- `isActive` is how a type is retired. A run stores a type's KEY and resolves
-- its height live, so deleting a type would silently shorten every run pointing
-- at it. Retiring takes it out of every picker and keeps it resolving for the
-- runs that already use it.
CREATE TABLE `takeoff_mounting_heights` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`typeKey` varchar(64) NOT NULL,
	`label` varchar(64) NOT NULL DEFAULT '',
	`heightInches` int,
	`isActive` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `takeoff_mounting_heights_id` PRIMARY KEY(`id`),
	CONSTRAINT `takeoff_mounting_heights_user_type_uq` UNIQUE(`userId`,`typeKey`),
	CONSTRAINT `takeoff_mounting_heights_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
);
