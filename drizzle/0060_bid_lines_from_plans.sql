-- The bridge: a bid line can say which counted group it came from.
--
-- One statement — see 0053 and 0054. The column, its foreign key and its unique
-- index go in a single ALTER because MySQL applies them together or not at all,
-- which is the property the one-statement rule is really after.
--
-- NULLABLE, and null on every row that exists today. That is what makes this
-- additive in the way that matters: every bid already priced reads, totals,
-- taxes, exports and prints exactly as it did before, because nothing here
-- backfills anything. A line is "from plans" precisely when this is set, which
-- is why there is no second boolean saying so — a flag beside the link is a
-- second thing that can drift out of step with it.
--
-- RESTRICT on delete, and it is neither of the two obvious choices:
--
--   SET NULL  would leave a from-plans line pointing at nothing — frozen costs,
--             a quantity that no longer follows any marks, and nothing on the
--             row to say that is what happened. Silently wrong money.
--   CASCADE   would pull money off a bid because somebody tidied a drawing.
--
-- So the database refuses, and `takeoffGroupsRouter.remove` checks first and
-- answers in a sentence naming the line. The constraint is the backstop under
-- the sentence, not the thing the user is meant to meet.
--
-- The UNIQUE index is R3's first half, in the database rather than only in the
-- router: one counted group can hold at most one live bid line, so a count
-- cannot be sent twice. MySQL allows many NULLs in a unique index, which is
-- exactly what is wanted — every hand-added line on every bid is NULL here and
-- none of them collide.
--
-- Archived lines share the index, and that is safe rather than overlooked: only
-- `archiveBidUnits` archives, it works by `unitLabel`, and a from-plans line
-- never carries one. Deleting a single line stays a hard delete, so the clean
-- undo — remove the line, send the count again — leaves nothing behind to
-- collide with.
ALTER TABLE `bid_line_items`
	ADD `takeoffGroupId` int,
	ADD CONSTRAINT `bid_line_items_takeoffGroupId_takeoff_groups_id_fk` FOREIGN KEY (`takeoffGroupId`) REFERENCES `takeoff_groups`(`id`) ON DELETE restrict ON UPDATE no action,
	ADD UNIQUE INDEX `bid_line_items_bid_group_uq` (`bidId`,`takeoffGroupId`);
