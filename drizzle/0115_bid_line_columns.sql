-- `bid_line_items`, ONE ALTER: the line's ROLE (owner Q2, remove/relocate
-- labor) and Track B's six quote-item columns (quote-items-plan.md § 8).
-- references/migrations-next-batch.md calls this the one to READ TWICE.
--
--   lineRole      enum('install','remove','relocate') NOT NULL DEFAULT
--                 'install'. The ONE column in the batch that is not
--                 "nullable, no default", ON PURPOSE (clash 8): MySQL treats
--                 NULLs in a unique key as all different, so a nullable role
--                 would silently stop guarding "one line per count". And
--                 'install' IS what every existing line already means, so the
--                 default changes no line's meaning.
--   bidUnitCost   material per unit priced ON THIS BID. NULL = none. ONE
--                 column for quote items AND the price box (clash 4).
--   isQuoteItem   NULL = no.        quoteId  -> bid_quotes, SET NULL.
--   quoteShare, quoteItemKey, quoteNote   NULL = none.
--
-- ── THE KEY SWAP, inside this one statement ─────────────────────────────────
-- ADD the new unique key (bidId, takeoffGroupId, lineRole), THEN drop the old
-- (bidId, takeoffGroupId). Old code never writes a role, so every line it
-- makes is 'install' and the new key is exactly as strict for it as the old.
-- `bidId`'s foreign key stays backed by bid_line_items_bidId_idx (0013),
-- which this does not touch — checked in the rehearsal.
--
-- ── ADDITIVE. STEP 1. MIGRATE BEFORE THE CODE ───────────────────────────────
-- Applying it must not move any number: prove with scripts/bidTotals.mts
-- before and after on the rehearsal copy. Comes after 0114 (quoteId).
--
-- Hand-written, not generated.
ALTER TABLE `bid_line_items`
	ADD `lineRole` enum('install','remove','relocate') NOT NULL DEFAULT 'install',
	ADD `bidUnitCost` decimal(12,4),
	ADD `isQuoteItem` boolean,
	ADD `quoteId` int,
	ADD `quoteShare` decimal(12,2),
	ADD `quoteItemKey` varchar(255),
	ADD `quoteNote` varchar(500),
	ADD CONSTRAINT `bid_line_items_bid_group_role_uq` UNIQUE(`bidId`,`takeoffGroupId`,`lineRole`),
	DROP INDEX `bid_line_items_bid_group_uq`,
	ADD CONSTRAINT `bid_line_items_quoteId_bid_quotes_id_fk` FOREIGN KEY (`quoteId`) REFERENCES `bid_quotes`(`id`) ON DELETE set null ON UPDATE no action;
