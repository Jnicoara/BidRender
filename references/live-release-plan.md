# Live release: migrations 0096–0104 and the code that matches. PLAN ONLY, 2026-10-05

**Nothing here has been run on live.** Live serves `0af50a6` and its database
records **96** migrations (0000–0095). Staging has run everything below
(`deploying.md` § 11, the 0096–0102 and 0103–0104 entries) and serves the
code that matches.

Read with `deploying.md` § 4 (deploy sequence), § 5 (three steps), § 5a
(backup and verify commands) and § 6 (verifying a deploy). This file is the
checklist for THIS release; those are the reasons.

## 1. What goes live

| What          | From        | To                                                                                                                                                   |
| ------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code (`main`) | `0af50a6`   | **the commit staging is serving** at release time — today `af65f84`. Never the tip of `local-dev` if it has moved (§ 4: release what staging tested) |
| Live database | 96 recorded | **105 recorded**: 9 files, 0096–0104                                                                                                                 |

**The nine files, all ADDITIVE — step 1 of the three, migrate BEFORE the
code. Step 3 is empty: no file has an `UPDATE`, no existing value changes
meaning.**

| File | Adds                                                                                       | Kind                              |
| ---- | ------------------------------------------------------------------------------------------ | --------------------------------- |
| 0096 | `'teeBody'` appended to `bid_line_items.runMaterialRole`                                   | enum append, no row holds it      |
| 0097 | `password_reset_tokens` table; `users.sessionsValidAfter` NULL                             | new table + nullable column       |
| 0098 | `takeoff_stamps`: status, rotation, mirrored, mountHeight×2, checkAcceptedAt, dropExcluded | nullable columns                  |
| 0099 | `takeoff_groups`: markShape/Letter/Color, symbolLookupKey                                  | nullable columns                  |
| 0100 | `assemblies`: markShape/Letter/Color                                                       | nullable columns                  |
| 0101 | `symbol_links`: markShape/Letter/Color, originalLabel                                      | nullable columns                  |
| 0102 | `symbol_looks` table (5 foreign keys, 2 indexes)                                           | new table                         |
| 0103 | `'unconfirmed'` appended to `takeoff_stamps.status`                                        | enum append on an all-NULL column |
| 0104 | `takeoff_runs`: startConnect, endConnect                                                   | nullable columns                  |

**Does any number on a live bid move? It must not.** Every new column is NULL
on every row, and NULL is today's meaning everywhere: a mark with no status
is new, so the "only new marks are quantities" rule (`shared/markStatus.ts`)
counts exactly what is counted now. § 4 step 9 below MEASURES that rather than
trusting it.

**What changes for a person:** "Forgot password?" appears on the sign-in page.
It sends mail only if live has `RESEND_API_KEY` (§ 2); without it the screen
says, in words, that reset by email is not set up yet. Changing a password in
Settings now signs every OTHER device out.

## 2. Before the day — settings and approvals

**Live app settings (DigitalOcean → bidrender app → Settings → environment):**

- `RESEND_API_KEY` — encrypted, **Run Time**. Needed for reset email. Optional
  for the release itself: without it reset says it is not set up.
- **Not** `STAGING_EMAIL_ALLOWLIST` and **not** `STAGING_PASSWORD` — those are
  what make a server staging. Setting either on live would gate or silence it.
- `VITE_APP_ID` already set (sign-in works today; sessions without it fail).
- There is no settings-check script for live (`stagingSettingsCheck.mts` is
  staging's): read the settings page and confirm these by eye.

**The owner approves, explicitly, at four points (each is a stop until "yes"):**

| #   | Approve                           | Evidence put in front of the owner                                                                                                                              |
| --- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | Go / no-go for the release window | Staging serves the release commit; **the smoke test is green on it** (Actions → Gate → smoke); the gate is green on it; `git log main..<commit> --oneline` read |
| B   | Touch the live database           | The fresh live backup restored and verified; the rehearsal on it printed **9 applied, 105 recorded, matches**, and data counts unchanged                        |
| C   | Push `main`                       | Live migrated (9 applied, matches); the OLD code still opens a real bid, its plans and totals                                                                   |
| D   | Done                              | `/api/version` shows the commit with a fresh `builtAt`; every live bid's total equals the "before" figure (§ 4 step 9)                                          |

## 3. Rollback — decided before starting

- **Code:** DigitalOcean → Activity → the previous deployment → **Rollback**.
  Minutes, touches nothing else. The fastest way out, and the first one.
- **Migrations: no rollback is planned, because none is needed.** They are
  additive and old code ignores new columns — which step C below proves on
  live before the push. A rolled-back build running against the migrated
  database is the state live is in during step C.
- **If a migration fails part way:** each file is ONE statement (one `ALTER`
  per table, or one `CREATE`), so each file applied whole or not at all.
  `migrate.mts` names the failed file and statement. **Stop; do not push
  `main`.** The applied ones are harmless to the old code. Find the cause on
  the restored copy, not on live.
- **Restore from the backup** only if data were damaged — which no file here
  can do (no `UPDATE`, no `DELETE`). Say so if it ever comes to it: restoring
  loses every write since the backup.

## 4. The sequence, on the day

Every step prints something. **If what it prints does not match what is
written here, stop and find out why before going on** — either this file is
stale (a migration landed since it was written) or the database is not where
you think it is, and those want opposite responses.

0. **Freeze merges** to `local-dev` for the window (tell B and C), so the
   commit staging serves cannot move. Optionally pause staging auto-deploy
   (`STAGING_AUTODEPLOY=off`).
1. **Pre-flight** (§ 3 of `deploying.md`): `curl -s
https://staging.bidridge.com/api/version` → note `commit`; `git log
main..<commit> --oneline`; `git status --porcelain` empty; the gate AND the
   smoke job green on `<commit>`. → **Approval A.**
2. **Back up live and prove it** (`deploying.md` § 5a steps 1–2):
   `DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/backup.mts`
   (note the run id), then `verifyBackup.mts` into the local MySQL with
   `KEEP_SCRATCH=1`, so the restored copy persists.
3. **Rehearse on that restored copy** (§ 5a step 3): drift before → **96
   recorded, 9 tables out**: bid_line_items, password_reset_tokens (missing
   table), users, takeoff_stamps, takeoff_groups, assemblies, symbol_links,
   symbol_looks (missing table), takeoff_runs. (Staging showed 8 before
   0096–0102 and 2 before 0103–0104 — together these nine, takeoff_stamps in
   both.) `migrate.mts` → **9 applied, 105 recorded**. Drift after →
   "matches", foreign keys **141 of 141** (135 after the 2026-09-29 release,
   - 5 on `symbol_looks`, + 1 on `password_reset_tokens`). Run it again → 0.
     Data counts before/after (users, bids, materials, stamps, groups, runs,
     line items) → identical. → **Approval B.**
4. **Measure every live bid's total, BEFORE** — read-only, a script that
   calls `bids.list`/the list pricing (`priceForList`) per company and writes
   `{bidId, totalDue, notPriced}` to a local file. Not written yet: writing it
   is part of preparing this release. It is what step 9 compares against.
5. **Live drift before:** `DOTENV_CONFIG_PATH=.env.production.local pnpm tsx
scripts/schemaDrift.mts` → 96 recorded, the same tables as step 3.
6. **Migrate live:** `ALLOW_REMOTE_DATABASE=yes
DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/migrate.mts` →
   **9 applied, 105 recorded**. Drift after → "matches". Second run → nothing.
7. **The OLD code against the migrated database:** `curl -s
https://bidridge.com/api/version` still `0af50a6`; open a real bid, its
   plans, its totals. → **Approval C.**
8. **Release:** `git checkout main && git merge --ff-only <commit> && git push
origin main && git checkout local-dev`. The ruleset accepts it only
   because the gate passed on that exact commit. Watch DigitalOcean →
   Activity (3–6 min); `/api/version` → the commit and a fresh `builtAt`.
9. **Every live bid's total, AFTER** — the same script. **Every `totalDue` and
   `notPriced` must equal step 4's.** A difference is a stop: roll back the
   code first (§ 3), then find out why on the restored copy. → **Approval D.**
10. **Unfreeze; record it** in `deploying.md` § 11 (what printed, the backup
    run id, the times), and mark Batches 1 and 1b live in
    `migrations-0098-batch-plan.md` § S.
11. **Reset email, if `RESEND_API_KEY` is set:** the owner asks for a reset to
    their own address, follows the link, signs in with the new password, and
    sees another signed-in browser signed out.

## 5. What is deliberately NOT in this release

- **Batch 2 onward** (invite gate, correction log, catalog, legend reading) —
  not written.
- **The materials rename** — waits on the size-reading fix and the owner's
  answers (`materials-naming-and-pricing-plan.md`).
- **The twin-count fold** (step 3, R.9) — not written; nothing on live has
  twins (`existingToRemain.ts` is on track-c only, last checked 2026-10-01).

## SHORT SUMMARY

- Live goes from `0af50a6` / 96 migrations to the staging-tested commit / 105
  — nine additive files, no `UPDATE`, no meaning change; step 3 is empty.
- Four owner approvals: go (smoke green on the commit), touch the database
  (backup verified + rehearsal 9/105/matches), push `main` (old code still
  works on the migrated database), done (every bid total unchanged).
- Rollback is the DigitalOcean button for code; migrations need none, because
  old code runs on them — proven on live before the push.
- A bid-totals before/after comparison is the wrong-number check; its
  read-only script is still to be written.
- Live needs `RESEND_API_KEY` for reset email, and must NOT get the staging
  settings.
