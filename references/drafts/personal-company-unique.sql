-- DRAFT — NOT IN drizzle/, NOT APPLIED ANYWHERE. Track A, 2026-10-14 night.
-- Give it the next free number and move it into drizzle/ only when the owner
-- says go (references/signup-race-plan.md § 2).
--
-- companies.personalOwnerUserId: the user this company was created FOR as
-- their personal company, NULL on any other. UNIQUE, so the DATABASE refuses
-- a second personal company for one user — the guarantee the named lock in
-- createPersonalCompany gives today only while every writer takes the lock.
-- MySQL lets any number of NULLs share a unique index, so unmarked companies
-- are unaffected.
--
-- Kind (CLAUDE.md § "Deploying a migration: THREE STEPS"): ADDITIVE, step 1.
-- The UPDATE fills only the column this file adds. Old code never names the
-- column, so it is safe ahead of the code. Step 3 empty.
--
-- Backfill: the LOWEST company id per owner is marked. On live today that
-- marks company 4 for user 3036 and leaves 5-8 NULL, so the unique index
-- cannot fail on the race's duplicates whether or not they are removed first.
-- A derived table, not `WHERE id IN (SELECT ... FROM companies)`: MySQL
-- refuses an UPDATE that reads its own table in a subquery (error 1093).
ALTER TABLE `companies` ADD `personalOwnerUserId` int;--> statement-breakpoint
ALTER TABLE `companies` ADD CONSTRAINT `companies_personalOwnerUserId_unique` UNIQUE(`personalOwnerUserId`);--> statement-breakpoint
UPDATE `companies` c
  JOIN (SELECT MIN(`id`) AS `id` FROM `companies` GROUP BY `ownerUserId`) first_company
    ON first_company.`id` = c.`id`
  SET c.`personalOwnerUserId` = c.`ownerUserId`
  WHERE c.`personalOwnerUserId` IS NULL;
