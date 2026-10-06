# Live release: `f8fdec3` and migrations 0096–0104. PLAN ONLY, updated 2026-10-06

**Nothing here has been run on live.** Checked 2026-10-06 17:19 UTC: live
serves **`0af50a6`** (built 2026-10-01) and its database records **96**
migrations (0000–0095, as of the last check — step 5 asks again). Staging
serves **`f8fdec3`** with all 105, and that commit has a **green gate (run 37421570630) and a green smoke test on staging (run 37422435526: 96 passed,
2 skipped)**. Between the two commits: 187 non-merge commits, and exactly the
nine migration files below.

> **Do not release `44f0f5f` or `6323a7b`.** Both carry the "keep early taps"
> change without its two follow-up fixes (taps counted twice; "0 marks"
> after a save). `f8fdec3` has both. If staging serves anything else on the
> day, this file is stale for that commit — stop and re-check § 1b.

Read with `deploying.md` § 4 (deploy sequence), § 5 (three steps), § 5a
(backup and verify commands) and § 6 (verifying a deploy). This file is the
checklist for THIS release; those are the reasons.

## 1. What goes live

| What          | From        | To                                                                                                                                                      |
| ------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Code (`main`) | `0af50a6`   | **`f8fdec3`** — the commit staging serves and the smoke test passed on. Never the tip of `local-dev` if it has moved (§ 4: release what staging tested) |
| Live database | 96 recorded | **105 recorded**: 9 files, 0096–0104                                                                                                                    |

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

**Does applying the migrations move any number on a live bid? It must not.**
Every new column is NULL on every row, and NULL is today's meaning
everywhere: a mark with no status is new, so the "only new marks are
quantities" rule (`shared/markStatus.ts`) counts exactly what is counted now.

### 1b. The CODE does change one number on purpose — measured, not assumed

`f8fdec3` includes Track B's rule (`5c98bd1`): **an assembly line with labor
and $0 material now counts its material as "not priced"**, where it used to
read as finished. Totals do not move (the material was $0 either way); the
"N not priced" count on those bids rises by one per such line.

**Measured 2026-10-06** on the local real-data copy (`bidrender_local`, at
105 migrations): `bidTotals.mts` from `0af50a6` against `f8fdec3`, same
database — **4,386 bids, every total unchanged, one bid's not-priced parts
0 → 2**, a fixture with two such lines. That is exactly the rule.

`bidTotals.mts --compare` now labels that case **EXPECTED** — only when the
total, the not-priced lines and the incomplete flag are all identical and
the parts rose by exactly the number of labor-with-$0-material lines on that
bid. Anything else stays **FAIL**. Checked both ways: one cent added to that
bid's total → FAIL; a parts rise on a bid with no such lines → FAIL.

Other changes in `f8fdec3` that touch quantities (the drop-claim fix,
"conduit waste covers the drops", mark status) moved **no total** on the
local copy. If one moves on the live copy, it is a **FAIL and a stop**: the
owner looks at that bid before anything goes further. A moved total is
never labelled expected.

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

**The owner approves, explicitly, at four points. Each is a full stop until
the owner says "yes".**

| #   | The owner is asked                            | What Track A shows first                                                                                                                                                                                                                                     |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A   | **"Start the release of `f8fdec3` now?"**     | Staging serves `f8fdec3`; gate and smoke green on it (runs 37421570630, 37422435526 — or newer runs on the same commit); what changes for a person (§ 1); nobody else merging (step 0).                                                                      |
| B   | **"Change the live database (add 9 files)?"** | A fresh live backup, restored and verified; on that copy: **9 applied, 105 recorded, "matches", foreign keys 141/141, second run applies 0**, data counts unchanged, and the bid-totals compare on the copy: **every total unchanged**, any EXPECTED listed. |
| C   | **"Put the new code live (push `main`)?"**    | Live migrated (9 applied, matches) and the OLD code (`0af50a6`) still opens a real bid, its plans and its totals.                                                                                                                                            |
| D   | **"Call it done?"**                           | `/api/version` on bidridge.com shows `f8fdec3` with a fresh `builtAt`; the bid-totals compare on live: **every total unchanged**, only EXPECTED lines otherwise (§ 1b).                                                                                      |

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
https://staging.bidridge.com/api/version` → **`f8fdec3`**; `curl -s
https://bidridge.com/api/version` → **`0af50a6`**; `git log
main..f8fdec3 --oneline` read; `git status --porcelain` empty; the gate AND
   the smoke job green on `f8fdec3`. → **Approval A.**
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
     line items) → identical. **Bid totals on the copy, too**: step 4's
     command against the copy BEFORE `migrate.mts`, the released commit's
     after it, then `--compare` → "all N bid(s) … unchanged". That rehearses
     step 9 on live's own data before live is touched. → **Approval B.**
4. **Measure every live bid's total, BEFORE** — `scripts/bidTotals.mts`
   (written 2026-10-05). It must run from the code LIVE SERVES, because this
   checkout's code reads columns live does not have yet, and "before" means
   what users see today:

   ```bash
   git worktree add ../bidrender-before 0af50a6
   cp scripts/bidTotals.mts ../bidrender-before/scripts/
   cd ../bidrender-before && pnpm install --frozen-lockfile
   DOTENV_CONFIG_PATH=../BidPhase/.env.production.local pnpm tsx scripts/bidTotals.mts ../bidrender-backups/live-totals-before.json
   ```

   **Copy the script from a checkout at or after 2026-10-06** — that version
   also counts each bid's labor-with-$0-material lines, which § 1b's
   EXPECTED label needs on BOTH sides. An older copy gives a "before" file
   without the count, and the compare then calls the expected change a FAIL.

   → `ok read only: MySQL refused a write`, then `N bid(s) priced for M
owner(s); the bids table holds N` — the two N must match, and the script
   exits 1 if they do not. Read only by construction: every connection is
   `SET SESSION TRANSACTION READ ONLY` and the script proves MySQL refuses a
   write before reading anything. **Rehearsed 2026-10-05** on a copy of
   `bidrender_local` (4,234 bids, 1,210 with a non-zero total): `0af50a6` on
   98 migrations against the code on 105 → all 4,234 unchanged. **And
   2026-10-06 against `f8fdec3`**: 4,386 bids, every total unchanged, 1
   EXPECTED (§ 1b).

   **If it prints `FAIL owner N: Failed query: insert into pricing_defaults`**,
   that owner has never had a pricing-defaults row and the app would create
   one on first read. The read-only session refused it, so that owner's
   bids are unmeasured. Stop and decide with the owner before going on. Do not
   switch the guard off to get a number.

5. **Live drift before:** `DOTENV_CONFIG_PATH=.env.production.local pnpm tsx
scripts/schemaDrift.mts` → 96 recorded, the same tables as step 3.
6. **Migrate live:** `ALLOW_REMOTE_DATABASE=yes
DOTENV_CONFIG_PATH=.env.production.local pnpm tsx scripts/migrate.mts` →
   **9 applied, 105 recorded**. Drift after → "matches". Second run → nothing.
7. **The OLD code against the migrated database:** `curl -s
https://bidridge.com/api/version` still `0af50a6`; open a real bid, its
   plans, its totals. → **Approval C.**
8. **Release:** `git checkout main && git merge --ff-only f8fdec3 && git push
origin main && git checkout local-dev`. The ruleset accepts it only
   because the gate passed on that exact commit. Watch DigitalOcean →
   Activity (3–6 min); `/api/version` → the commit and a fresh `builtAt`.
9. **Every live bid's total, AFTER** — the same script, run with the
   released code. **`f8fdec3` holds the OLDER script**, so copy the
   2026-10-06 one in exactly as in step 4 (from `a-migrations-plan`
   `48af57a` or later), or the expected change reads as a FAIL:

   ```bash
   git worktree add ../bidrender-after f8fdec3
   cp scripts/bidTotals.mts ../bidrender-after/scripts/
   cd ../bidrender-after && pnpm install --frozen-lockfile
   DOTENV_CONFIG_PATH=../BidPhase/.env.production.local pnpm tsx scripts/bidTotals.mts ../bidrender-backups/live-totals-after.json
   pnpm tsx scripts/bidTotals.mts --compare ../bidrender-backups/live-totals-before.json ../bidrender-backups/live-totals-after.json
   ```

   **Every `totalDue` must equal step 4's, no exceptions.** Not-priced and
   `incomplete` must equal step 4's too, except lines the compare prints as
   **EXPECTED** (§ 1b: labor with $0 material). Last line to expect: `ok all
N bid(s): totalDue unchanged; …` (with "except K EXPECTED" if any).
   Any **FAIL** is a stop: roll back the code first (§ 3), then find out why
   on the restored copy. One honest exception to check before rolling back:
   a contractor can edit a bid during the window, and that is a real change,
   not a fault. `--compare` adds "bid edited at …, after before was measured"
   to such a line; check that bid before rolling anything back.
   → **Approval D.**

10. **Unfreeze; record it** in `deploying.md` § 11 (what printed, the backup
    run id, the times), and mark Batches 1 and 1b live in
    `migrations-0098-batch-plan.md` § S.
11. **Reset email, if `RESEND_API_KEY` is set:** the owner asks for a reset to
    their own address, follows the link, signs in with the new password, and
    sees another signed-in browser signed out.

## 5. What is deliberately NOT in this release

- **Every migration from 0105 on** — the invite gate, the correction log,
  remove/relocate labor, quote items, B's height columns, C's look and
  label columns, the catalog and legend batches. Numbered in
  `migrations-next-batch.md`; none written.
- **The materials rename** — waits on the size-reading fix and the owner's
  answers (`materials-naming-and-pricing-plan.md`).
- **The twin-count fold** (step 3, R.9) — not written; nothing on live has
  twins (`existingToRemain.ts` is on track-c only, last checked 2026-10-01).

## SHORT SUMMARY

- Live goes from `0af50a6` / 96 migrations to **`f8fdec3`** / 105 — nine
  additive files, no `UPDATE`, no meaning change; step 3 is empty. `f8fdec3`
  is green on the gate and on the staging smoke test.
- Four owner approvals: A start, B change the live database, C push the new
  code, D done — each with its evidence in § 2.
- One number changes on purpose: lines with labor and $0 material now say
  "not priced" (Track B's rule). Totals do not move. The compare labels that
  EXPECTED and fails on anything else; measured on 4,386 local bids (1 such).
- Rollback is the DigitalOcean button for code; migrations need none, because
  old code runs on them — proven on live before the push.
- Live needs `RESEND_API_KEY` for reset email, and must NOT get the staging
  settings.
