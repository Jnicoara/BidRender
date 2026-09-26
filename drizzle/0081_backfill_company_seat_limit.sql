-- Give every existing company a seat limit of at least what it already uses.
--
-- ADDITIVE. STEP 1, with 0080. MIGRATE BEFORE THE CODE.
-- The UPDATE writes only `seatLimit`, which 0080 added in this same batch, so
-- no existing value changes meaning (references/deploying.md § 5, question 1).
-- **Step 3 is empty.**
--
-- In use = ACTIVE members + PENDING invites (not accepted, not revoked, not
-- expired) — the definition in shared/seats.ts, restated in SQL. Suspended
-- members are not counted, because suspending is how a member is removed.
--
-- GREATEST(seatLimit, ...) rather than GREATEST(1, ...): a re-run never LOWERS
-- a limit an admin has since raised, and never lowers one below what is in
-- use. Running this twice changes nothing the second time.
--
-- Report what it set with `scripts/seatReport.mts`, run before AND after:
-- the "before" reading is what it will do, the "after" is what it did.
UPDATE `companies` c
   SET c.`seatLimit` = GREATEST(
     c.`seatLimit`,
     (SELECT COUNT(*) FROM `company_members` m
       WHERE m.`companyId` = c.`id` AND m.`status` = 'active')
     +
     (SELECT COUNT(*) FROM `company_invites` i
       WHERE i.`companyId` = c.`id`
         AND i.`acceptedAt` IS NULL
         AND i.`revokedAt` IS NULL
         AND i.`expiresAt` > NOW())
   );
