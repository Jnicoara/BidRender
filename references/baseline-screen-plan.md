# Baseline screen — editing the shipped starter on LIVE. PLAN ONLY, 2026-10-10

Track C, at the owner's request. **Plan only: no code, no migration.** Facts
are cited by file and line from `track-c` at `d9d49b8`. Nothing was run
against a database.

**What it is:** an admin-only screen on the live site. The owner uses it to
edit the shipped starter's **material prices**, **material labor hours** and
**assembly hours**. Each change reaches every company **except** on items
that company already changed, and it never moves a sent or locked bid.

**What this builds on, and what it overrides. Read these first:**

- `before-beta-checklist.md` § 3, "An admin 'baseline' screen" (owner,
  2026-10-08): the item this plan answers.
- `starter-vs-company-plan.md` § 3 (Track A, 2026-10-07): the rules, the
  "Shape A / Shape B" choice, and "the screen must NOT exist before he
  fills the sheets". This plan is the "its own plan when the time comes"
  that § 3 promised. It keeps Shape B's idea (the live database holds the
  starter), but **not** its separate `starter_*` tables. See § 5 for why.
- **CLAUDE.md § "Where a priced catalog lands: THE SEED FILES, AND NOTHING
  ELSE" (2026-09-21) is overridden by this plan for three fields only**:
  price, material labor hours and assembly hours. For those, the live
  database becomes the truth and the seed files become an export of it.
  CLAUDE.md is changed **in the same commit as the boot change in § 5**,
  not before, and the old paragraph keeps a line saying what replaced it.
  Until then the seed files stay the only way in (`pricing/loadStarterSheets.mts`).
- The "Example price" / "Example hours" rule (owner, 2026-10-07,
  `shared/exampleTags.ts`): shown on the shop's own bid screen, never on the
  quote, cleared when a shop edits that number, frozen onto each bid line.

---

## 0. The rules every piece keeps

1. **A shop's own edit is never overwritten.** Not by the screen, not by a
   sheet, not by "Copy from my company", not by an undo.
2. **No bid moves.** A sent, locked or open bid keeps every number it has.
   A starter change reaches only lines **added after it**. This is already
   true for price, hours and rate (`snapshotMaterialCost`,
   `snapshotLaborHours`, `snapshotLaborRate`). It is **proved per release
   with `scripts/bidTotals.mts`**, not asserted (§ 6).
3. **Every starter number stays tagged "Example price" / "Example hours"**
   until a shop edits it. The screen cannot write an untagged starter
   number.
4. **One path writes the starter.** The screen, the sheet upload, the copy
   step, an undo and the seed's boot pass all go through ONE function
   (`applyStarterChange`, § 3). There are not four writers that agree today
   and drift tomorrow.
5. **Preview before every write.** Nothing reaches the database until the
   owner has seen the list of changes and pressed Confirm.

---

## 1. Who can open it — a separate master account and a second sign-in step

### What exists

- `users.role` is `user | admin | contractor` (`drizzle/schema.ts:34`).
  `adminProcedure` admits `role === "admin"`. **The owner's own account is
  that admin AND his company's owner**, so today "admin" and "my shop" are
  one login.
- Sign-in is email and password (`authRouter.ts`). Sessions last a year
  (`ONE_YEAR_MS`, `server/_core/sdk.ts:187`). `users.sessionsValidAfter`
  (schema:111) kills older sessions.
- **No second factor exists anywhere.** Email sending exists (Resend,
  `server/email/`).
- `companyScope` **fails closed**: a user with no company membership gets
  an error from every company procedure (`server/_core/companyScope.ts`).

### What is new

**A master account that is not a company.** A new role, `starter_editor`,
on its own login (for example `starter@bidridge.com`). It is not the
owner's account.

- **It has no company.** Because `companyScope` fails closed, every normal
  screen and procedure refuses it. It can open the baseline screen and
  nothing else. So it cannot quietly price a bid, and the owner's own
  account cannot quietly edit the starter.
- **The owner's own account cannot open the baseline screen**, even though
  it is `admin`. The two roles never overlap: one enum value each.
- **It cannot be made from the app.** Signup can never produce
  `starter_editor`. Track A creates it with a script
  (`scripts/createStarterEditor.mts`, behind `ALLOW_REMOTE_DATABASE=yes`,
  like every script that writes).
- **The screen looks different on purpose.** A coloured band across the
  top reads "STARTER: changes reach every company". It is not the shop
  screen with one more menu item.
- **Use a separate browser profile for it.** One browser holds one session
  cookie. Signing in as the master account in the same window signs the
  owner out of his shop. The screen says so on the sign-in page.

**The second step: a 6-digit code from an authenticator app** (TOTP, the
standard 30-second code that Google Authenticator, 1Password and Authy
show). Suggested over an emailed code (Q1): this account can change every
company's next bid, so a stolen email inbox must not be enough.

- **Enrolment:** on its first sign-in the account shows a QR code once.
  The owner scans it and types one code to prove it works. Then it shows
  **10 recovery codes once**, stored hashed, each usable once.
- **Every sign-in asks for the code.** Five wrong codes lock the account
  for 15 minutes, and that is said in the message. A code is accepted once
  (replay is refused), within one 30-second step either side.
- **Short sessions:** 8 hours at most, and 30 minutes idle. Not a year.
- **The session carries "second step done at T".** A new
  `starterEditorProcedure` checks the role AND that mark. A password alone
  reaches nothing.
- **The secret is encrypted at rest** with a key from the environment
  (`STARTER_TOTP_KEY`), so a copy of the database alone cannot mint codes.
- The code check is about 30 lines of `node:crypto` (RFC 6238). No new
  package is needed for it. The QR image needs one small client package or
  a typed-in secret (Q2).

### Lost phone

A recovery code works once. With none left, Track A resets the second step
with the same script (`--reset-2fa`). That also sets `sessionsValidAfter`,
so every open session of that account dies.

---

## 2. Which fields, and the rules for each

### In scope (first version)

| Table        | Field                 | Tag that marks it "not the shop's own" |
| ------------ | --------------------- | -------------------------------------- |
| `materials`  | `costPerUnit`         | `isExamplePrice`                       |
| `materials`  | `laborHours`          | `isExampleLaborHours`                  |
| `materials`  | `fieldBendLaborHours` | `isExampleLaborHours`                  |
| `assemblies` | `baseLaborHours`      | `isExampleHours`                       |
| `assemblies` | `overheadLaborHours`  | `isExampleHours`                       |

All five are `decimal(10,4)`. Only **shared** rows (`userId IS NULL`) are
edited. NULL means "not set" and the screen keeps it that way: a blank box
is NULL, never 0 (CLAUDE.md § Editing fields, rule 6).

**Out of scope for now:** labor rates (`isExampleRate` exists), labor-step
minutes (0143, `isExampleMinutes`), names, categories, recipes. See Q8.
Every one could join later as one more row in the field list; the log and
the push rule do not change shape.

### Rule A — never overwrite a shop's own edit

A company that edits a starter item gets a **fork**: its own row with
`baselineId` pointing at the starter (`forkMaterial`, `server/db.ts:1960`).
That company reads its fork from then on (`mergeLibraryRows`). So a change
to the shared row **already** reaches every company with no fork, and
skips every company with one.

**The gap: a fork is made for ANY edit.** A shop that renamed a wire, or
changed its supplier, has a fork holding the OLD starter price, although
it never touched the price. Rule A as worded would leave that shop on the
old price forever.

**So the push goes field by field, into forks too, under a double guard.**
A fork's field gets the new starter value only when **both** are true:

1. its tag for that field is **not FALSE** (the shop has not edited that
   number; `shared/exampleTags.ts` clears the tag only when the number
   really changes, `materialsRouter.ts` update), **and**
2. its value **still equals the starter's OLD value** (NULL equals NULL).

Both, because each one alone has a hole:

- **The tag alone** misses a real case found while writing this plan:
  editing an assembly's **overhead** hours does NOT clear
  `isExampleHours`. Only a base-hours change does
  (`server/routers/assembliesRouter.ts:316`; overhead at :322). A tag-only
  push would overwrite a shop's overhead edit. **Fix in the same change:**
  clear the tag when either hours field changes. Guard 2 catches it
  regardless.
- **The value alone** cannot tell "never touched" from "typed the same
  number". Forks from before the tags existed (tag NULL) rely on it, and
  that is the safe reading: equal to the starter means nothing to protect.

A fork that fails either guard is **left alone and counted** in the
preview: "12 companies changed this price themselves — left as theirs". A
fork that has the tag but a different value (a stale copy from before a
seed re-stamp) is also left alone, and counted separately: "3 copies still
tagged Example but on an older value". Leaving them alone is the safe
direction (§ 7 Q5 asks whether to bring them up to date).

A pushed fork gets the new value **and** the tag TRUE. Its own `updatedAt`
moves; `priceUpdatedAt` does not, because the shop did not price it.

### Rule B — sent and locked bids never move

Bid lines freeze price, hours, rate and both example flags when added
(`snapshotMaterialCost`, `snapshotLaborHours`, `snapshotPriceWasExample`,
`snapshotHoursWereExample`; `server/db.ts` ~14883). So **no existing line
moves**: sent, locked or open.

**The one known exception must be closed before the screen's first write:**
lines from before 0087 read their recipe's not-priced count LIVE
(`todo.md` "WRONG-NUMBER RISK", `snapshotUnpricedParts`). Live had **0**
such lines when counted 2026-10-07 (`live-release-plan.md`). **Recount
before release. It must be 0, or the one-time freeze runs first.**

**What does move, on purpose:** a line added AFTER a change uses the new
value. That is the point of the screen.

### Rule C — tags stay until a shop edits

The screen always writes the tag TRUE on the shared row with the number.
There is no "untagged" option. A shop's edit clears it as today. Copying
from the owner's company (§ 8) also writes TRUE: to every other company it
is still BidRidge's example, not their own.

---

## 3. The change log, and undo

### What is recorded

Every write, from any source, is one **change**: one shared row, one field.
Changes are grouped in a **batch**: one Confirm press, one sheet upload,
one copy step, one undo, or one boot of the seed.

Each change records: who (the editor's user id, or NULL for the seed
boot), when, the row and field, **old value and new value**, the old tag,
an optional note, and how many forks were updated and left alone. Each
fork write records the fork's id and its old value and tag, so an undo is
exact. **The log stores numbers only, never a company's name**. The screen
shows counts of companies, never which ones (another contractor's prices
are not the owner's to browse).

### The screen

A **History** tab: newest batch first. "Sheet upload, 412 changes, Sat
10 Oct 21:04, starter@bidridge.com". Opening it lists each change: item,
field, old → new, forks updated / left. Filter by item name.

### Undo one change

- **Allowed only if the shared row still holds this change's new value.**
  If something changed it since, the undo says which change did ("Changed
  again by #318 on 12 Oct — undo that first"). It never guesses.
- It writes the old value and old tag back to the shared row. Then, for
  each fork this change pushed, it writes the fork's old value back **only
  if that fork still holds the pushed value with the tag still TRUE**. A
  shop that edited it since keeps its edit, and the undo says how many.
- **An undo is itself a change** (source `undo`), logged like any other.
  So an undo can be undone; that is "redo".
- **An undo moves no bid either.** Lines added between the change and the
  undo keep the value they were priced at.

### Undo a whole batch

Every change in the batch, newest first, by the same rule. It runs as **a
preview first**: "408 of 412 can be undone. 4 were changed again since:
[list]". Confirm undoes the 408 in one transaction and logs one `undo`
batch; the 4 stay and are listed. All-or-nothing is offered as a choice
when anything is blocked (Q6).

---

## 4. Bulk edit — load the pricing sheet through the screen

So Excel still works for big fills.

- **The same sheets** the owner fills today: `starter-catalog-pricing.xlsx`,
  `labor-units-starter.xlsx`, `assembly-hours-starter.xlsx`, built by
  `pricing/buildStarterSheets.mts`.
- **The same checks** `pricing/loadStarterSheets.mts` runs today: unknown
  name, unit mismatch, bad number, bend hours off a raceway, duplicate
  rows, each refused with its sheet row. **They move into one shared
  module** that both the script and the screen call. Two copies of the
  checks would drift (CLAUDE.md § "Copying a layout does not copy the
  behaviour").
- **Where the .xlsx is read:** `exceljs` is deliberately NOT a dependency
  (`pricing/buildStarterSheets.mts:9`). Suggested: the browser reads the
  file with a library loaded only on this screen, and sends rows; the
  server re-checks every row with the shared module before anything is
  previewed. The server never trusts the browser's parse. Q3 asks.
- **Preview, then Confirm.** The preview lists only rows that would
  CHANGE: item, field, current → new, and how many companies it reaches
  vs leaves. Unchanged rows are a count ("1,203 rows unchanged"). Refused
  rows are listed with their sheet row and reason, and **one refused row
  blocks Confirm** until the sheet is fixed (Q4).
- **Blank cell = no change**, never "set to not set". Clearing a value to
  "not set" is a typed action on the screen, so a half-filled sheet can
  never wipe numbers.
- The batch records the file name and its SHA-256, so History can say
  which file did it.
- **Download current values** as the same .xlsx shape, so a round trip
  (download, edit, upload) is the normal way to fill in bulk.

---

## 5. Keeping the seed files and the live starter in step

### The problem

Today the boot re-stamps every shared row's price and labor hours from the
seed files on every start (`server/db.ts` ~2420–2440), and starter
assembly hours for the names `starterAssemblyHours.ts` lists (~4732). **A
screen edit would be wiped by the next deploy.** And a brand-new database
(local, test, a rebuilt staging) only ever gets the seed files.

### The design

1. **On LIVE, the shared rows are the starter.** New companies read them
   directly, so a new company on live gets every screen change at once.
   No copying is involved.
2. **The boot stops re-stamping a field the screen has changed.** For the
   five fields in § 2, the boot pass skips any (row, field) with an
   un-undone change in the log from a source other than the seed. Every
   other field, and every row the screen never touched, re-stamps as
   today.
3. **When the boot DOES change one of those five fields, it goes through
   `applyStarterChange`** with source `seed`. So it pushes to untouched
   forks by the same guards and appears in History. Today it does neither.
4. **Export to seed.** A button writes `starterPrices.ts`,
   `starterLaborUnits.ts` and `starterAssemblyHours.ts` from the live
   values, in the exact format `loadStarterSheets.mts` writes today. Track
   A commits them. Then a brand-new database seeds to the same values as
   live.
5. **Disagreement is shown, not hidden.** The screen has a line: "Seed
   files differ from live on 37 values: Export". After A commits the
   export and it deploys, the line reads 0. A read-only
   `scripts/starterDrift.mts` reports the same from a command line, the
   way `scripts/schemaDrift.mts` does for migrations.
6. **When a seed value conflicts with a screen change** (A loaded a new
   sheet into the seed, and the owner had also changed that item on the
   screen), the live value stays and the screen lists the conflict: "seed
   says $0.55, live says $0.52: Keep live / Take seed". Taking the seed is
   an ordinary logged change.

**Why not separate `starter_*` tables**, which `starter-vs-company-plan.md`
§ 3 Shape B suggested: the `userId IS NULL` rows already ARE a starter
table. Every screen, fork and revert reads them. A second copy would be
two sources of truth, which is what this section exists to prevent.

**What this changes for staging:** staging has its own database. A change
on live reaches staging only through the export, a commit and a deploy.
That is correct: staging should run what the seed says.

### The test that makes it a guard

`server/starterPush.test.ts` (C): round trip. Seed a test database, change
values through `applyStarterChange`, export, re-seed a fresh database from
the export, and compare. They must be identical. Plus the guards: a fork
with tag FALSE is never written, a fork whose value differs is never
written, an undo never touches a fork the shop edited since, and the boot
pass skips a screen-changed field. Each test must fail with its guard
removed.

---

## 6. Proof that no bid moves — per release, measured

- **Before the first write on live:** recount the pre-0087 lines (§ 2,
  rule B). Must be 0.
- **In the build:** on a migrated copy, `scripts/bidTotals.mts`, then
  apply a sheet that changes every in-scope field, then `bidTotals.mts`
  again. It must say "all N bid(s): totalDue unchanged; not-priced and
  incomplete unchanged". Any moved total fails the build. This is the
  number-level version of rule B, and it covers every line kind, including
  takeoff-linked lines (quantity live, pricing frozen) and run-type lines.
  A claim that they freeze is not proof.
- **Counted in the preview, not asserted:** companies reached, forks
  updated, forks left as the shop's own.

---

## 7. Migrations — drafts for Track A, unnumbered

The latest file on disk is `0143_labor_steps.sql`; A assigns numbers. **All
additive (step 1)**, safe before the code, because nothing reads them
until the code ships. **Step 3 is empty.**

**BS-M1: the role.** Appends one enum value at the end.

```sql
ALTER TABLE `users` MODIFY COLUMN `role`
  enum('user','admin','contractor','starter_editor') NOT NULL DEFAULT 'user';
```

**BS-M2: the second step.**

```sql
CREATE TABLE `starter_editor_factors` (
	`userId` int NOT NULL,
	`totpSecretEnc` varchar(255) NOT NULL,
	`enrolledAt` timestamp NULL,
	`lastUsedStep` bigint NULL,
	`failedAttempts` int NOT NULL DEFAULT 0,
	`lockedUntil` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `starter_editor_factors_userId` PRIMARY KEY(`userId`),
	CONSTRAINT `starter_editor_factors_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `starter_editor_recovery_codes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`codeHash` varchar(255) NOT NULL,
	`usedAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `starter_editor_recovery_codes_id` PRIMARY KEY(`id`),
	CONSTRAINT `starter_editor_recovery_codes_userId_users_id_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
CREATE INDEX `starter_editor_recovery_codes_userId_idx` ON `starter_editor_recovery_codes` (`userId`);
```

**BS-M3: the change log.** `editorUserId` is NULL for the seed boot, and
`ON DELETE set null` so the history outlives an account.

```sql
CREATE TABLE `starter_change_batches` (
	`id` int AUTO_INCREMENT NOT NULL,
	`editorUserId` int NULL,
	`source` enum('screen','sheet','copy','seed','undo') NOT NULL,
	`label` varchar(255) NULL,
	`fileName` varchar(255) NULL,
	`fileSha256` char(64) NULL,
	`changeCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `starter_change_batches_id` PRIMARY KEY(`id`),
	CONSTRAINT `starter_change_batches_editorUserId_users_id_fk` FOREIGN KEY (`editorUserId`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
CREATE TABLE `starter_changes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`batchId` int NOT NULL,
	`targetTable` enum('materials','assemblies') NOT NULL,
	`targetId` int NOT NULL,
	`field` enum('costPerUnit','laborHours','fieldBendLaborHours','baseLaborHours','overheadLaborHours') NOT NULL,
	`oldValue` decimal(10,4) NULL,
	`newValue` decimal(10,4) NULL,
	`oldExample` boolean NULL,
	`note` text NULL,
	`forksUpdated` int NOT NULL DEFAULT 0,
	`forksLeft` int NOT NULL DEFAULT 0,
	`undoneByChangeId` int NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `starter_changes_id` PRIMARY KEY(`id`),
	CONSTRAINT `starter_changes_batchId_starter_change_batches_id_fk` FOREIGN KEY (`batchId`) REFERENCES `starter_change_batches`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
CREATE INDEX `starter_changes_target_idx` ON `starter_changes` (`targetTable`,`targetId`,`field`);
CREATE INDEX `starter_changes_batchId_idx` ON `starter_changes` (`batchId`);
CREATE TABLE `starter_change_fork_writes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`changeId` int NOT NULL,
	`forkId` int NOT NULL,
	`oldValue` decimal(10,4) NULL,
	`oldExample` boolean NULL,
	CONSTRAINT `starter_change_fork_writes_id` PRIMARY KEY(`id`),
	CONSTRAINT `starter_change_fork_writes_changeId_starter_changes_id_fk` FOREIGN KEY (`changeId`) REFERENCES `starter_changes`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
CREATE INDEX `starter_change_fork_writes_changeId_idx` ON `starter_change_fork_writes` (`changeId`);
```

`forkId` has no foreign key on purpose: it points into `materials` or
`assemblies` depending on `targetTable`. A deleted fork leaves a write
record the undo skips.

**No migration** for: the example tags (0132–0134 exist), the snapshots
(exist), "My changes" (§ 8 reads existing columns), the export (files).

**Order:** BS-M1 to BS-M3 apply before the code, in any order.
`drizzle-kit generate` must not be used for these (CLAUDE.md: it re-emits
hand-written migrations). Hand-write them from the drafts above.

---

## 8. "My changes" in the owner's company, and "Copy from my company"

### "My changes" — in ANY company, not admin-only

A tab on the Materials screen and the Assemblies screen (or one Settings
panel; Q9): **every price, labor hour and assembly hour this company
typed that differs from the shipped starter**, with the shipped value
beside it.

| Item              | Field       | Shipped (example) | Yours | Changed |
| ----------------- | ----------- | ----------------- | ----- | ------- |
| 12/2 NM-B Copper  | Price / ft  | $0.5520           | $0.48 | 3 Oct   |
| Duplex receptacle | Labor hours | 0.30              | 0.25  | 5 Oct   |
| 200A panel F&I    | Base hours  | 8.00              | 10.00 | 6 Oct   |

- Read from the company's forks (`baselineId` set) whose field differs
  from its shared row's current value. No migration.
- **Items the company made itself** (no `baselineId`) have no shipped
  value to compare, so they are not in this list (Q10).
- Each row keeps the existing "Revert to shipped" (`revertMaterialToBaseline`).
- Useful to every shop, not just the owner: "what have I changed from
  BidRidge's numbers".

### "Copy from my company" — on the baseline screen

So the owner's own tested numbers can become the starter without retyping
them.

1. **Which company:** only ONE, the owner's, named in the environment
   (`STARTER_COPY_SOURCE_OWNER_ID`), not picked on the screen. The master
   account can never read any other company's numbers. Changing the
   source is a deploy, not a click (Q11).
2. **The list:** the same "My changes" rows for that company, with a tick
   box per row.
3. **Default ticks: labor hours and assembly hours ON; material prices
   OFF**, ticked one by one. The owner's supply-house prices stay in his
   company unless he chooses each one.
4. **Preview, then Confirm**, exactly as § 4: current starter → new,
   companies reached, forks left.
5. **Same rules:** one `copy` batch through `applyStarterChange`, the tag
   written TRUE, shops' own edits never overwritten, no bid moves,
   History and undo as § 3.
6. **The owner's company itself is unchanged.** His forks keep his
   numbers, which now equal the starter's.

---

## 9. Who builds what

The checklist line says "A (schema) + B (screen)". Suggested split (Q12):

| Track | Builds                                                                                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** | BS-M1–M3; the `starter_editor` account script and the second step (sign-in, enrolment, recovery, short session, `starterEditorProcedure`); the boot-pass change (§ 5.2–5.3); the CLAUDE.md amendment; the pre-0087 recount; applying on staging then live |
| **C** | `applyStarterChange`, the push guards, undo (`shared/starterPush.ts` + server), the overhead-tag fix, the shared sheet checks pulled out of `loadStarterSheets.mts`, export to seed, `starterDrift.mts`, "My changes", "Copy from my company", the tests  |
| **B** | The baseline screen: the band, the list with search, edit-in-place by the § Editing-fields rules, History, sheet upload with preview, conflicts, the Export line                                                                                          |

**Build order:**

1. A: migrations and the account with its second step. Nothing else can be
   tested without them.
2. C: `applyStarterChange` + guards + undo + tests, and the overhead-tag
   fix. This is where a wrong number would come from, so it lands first
   and alone.
3. A: the boot-pass change, then the export, in the same release as 2.
4. B: the screen on top.
5. C: "My changes", then "Copy from my company".
6. Sheet upload last: it is the biggest write, and the screen must have
   proved undo on single edits first.

**Before any of it goes live:** the pre-0087 recount (must be 0), and the
`bidTotals.mts` check in § 6.

---

## 10. Questions for the owner — each with a suggested answer

| Q   | Question                                                                                                              | Suggested answer                                                                                                                                   | Moves a bid number?                                 |
| --- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | Second step: an authenticator app code, or a code emailed to you?                                                     | **Authenticator app.** This account changes every company's next bid; a stolen inbox must not be enough.                                           | No                                                  |
| 2   | Enrolment: show a QR code (one small package), or type a setup key into the app by hand?                              | **QR code.** Typing a 32-letter key is error-prone, and it is done once.                                                                           | No                                                  |
| 3   | Reading the .xlsx: in the browser (a library loaded only on this screen), or add a spreadsheet package to the server? | **In the browser**, with every row re-checked on the server. Keeps the live server's packages as they are.                                         | No                                                  |
| 4   | A sheet with some bad rows: block the whole upload, or apply the good rows?                                           | **Block it** and list the bad rows. A half-applied sheet is hard to reason about; fix and re-upload.                                               | No                                                  |
| 5   | A company's copy still tagged "Example" but on an OLD starter value (from before a re-stamp): bring it up to date?    | **Not by default.** Show the count, with a separate "Bring 3 old example copies up to date" button. Updating them changes those shops' next lines. | **Yes**, on those companies' new lines, if done     |
| 6   | Undo a batch when a few items were changed again since: undo the rest, or refuse the whole undo?                      | **Undo the rest**, listing the ones left. Offer "refuse unless all" as a tick.                                                                     | **Yes**, on new lines (it changes the starter back) |
| 7   | Does a starter change reach companies that copied the item for another reason (renamed it, changed the supplier)?     | **Yes, field by field**, under the double guard in § 2. Otherwise renaming a wire freezes its price forever.                                       | **Yes**, on those companies' new lines              |
| 8   | Add labor rates and labor-step minutes to the screen now, or later?                                                   | **Later.** Prices and hours first; both fit the same log when wanted.                                                                              | Later, yes                                          |
| 9   | "My changes": its own Settings panel, or a tab on Materials and on Assemblies?                                        | **A tab on each**, beside the rows it is about.                                                                                                    | No                                                  |
| 10  | Items you made yourself (not from the starter): offer "Add to the starter" from the copy step?                        | **Not in this version.** A new shipped item needs a name, category and search words (CLAUDE.md § Materials), which is seed work.                   | No                                                  |
| 11  | The copy source: fixed to your company in the server settings, or chosen on the screen?                               | **Fixed in the server settings.** The master account can then never read another contractor's prices.                                              | No                                                  |
| 12  | Track split as § 9 (A account + boot, C rules, B screen), or fewer tracks?                                            | **As § 9.** The rules that can produce a wrong number stay in one track with their tests.                                                          | No                                                  |
| 13  | Should open (unsent) bids be offered "re-price from the new starter"?                                                 | **No, not in this version.** Every line keeps what it was priced at; only new lines use the new value. A re-price button is its own plan.          | **Yes** if built                                    |

**Questions 5, 6, 7 and 13 change bid numbers** (on new lines only; no
existing line ever moves). The owner decides them.

---

## 11. Short answer

- A separate `starter_editor` login with no company, an authenticator code
  at every sign-in, 8-hour sessions; the owner's own account cannot open
  it.
- One function writes the starter. It pushes field by field into
  companies' copies only where the shop has not touched that number, tags
  everything "Example", logs old and new, and can undo one change or a
  batch.
- The live database holds the starter for price and hours. The boot stops
  overwriting screen changes, and "Export to seed" keeps new databases
  identical, with any difference shown on the screen.
- Excel still works: upload the same sheets, preview, confirm; the same
  checks as the loader, shared.
- "My changes" shows any company what it changed from the starter;
  "Copy from my company" turns the owner's hours (prices one by one) into
  the starter. Three additive migrations; no bid moves, proved with
  `bidTotals.mts`.
