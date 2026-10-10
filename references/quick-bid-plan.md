# Quick bid additions — PLAN ONLY, 2026-10-10

Track C. **Nothing here is built.** Seven additions to the Quick bid screen
(`client/src/pages/QuickBidPage.tsx`, the Count screen at `/bids/:id/count`),
most important first. Each says what already exists, what is new, its safe
default, its fix-it, whether it moves a bid number, and what Track A has to
migrate.

If a file, column or count named here does not match what you find, stop and
find out why before going on — either this file is stale or the code moved.

## 0. The rule every piece keeps

**The basic screen stays type → quantity → Enter.** Nothing below adds a
step to that loop. Each addition is either something the search box can find
(a run type, a homerun line, a job cost) or a control that sits beside the
loop, never in it. A person who only ever counts assemblies sees the same
screen they see today, plus one "More options" fold.

Standing rules this plan follows, so they are not repeated per piece:

- **Every new option has a safe default and lives under "More options".**
  The default is always "what happens today", so no existing bid moves.
- **A little high beats low.** Where a number has to be assumed, the plan
  picks the higher reasonable one and says so on screen.
- **Every warning has a fix-it button right there.** No warning only says
  what is wrong.
- **Unset is "Not priced", never $0** (CLAUDE.md § Editing fields 6).
- **Manual first** (CLAUDE.md § "As manual or as automated"). Somebody with
  an empty library can use every piece. Somebody with a full one can skip
  every step.

Earlier records this builds on (cited so the next search finds them):
`homerun-footage-plan.md` (Average method, `bids.homerunAverageFt`, 0127),
`remove-relocate-labor-plan.md` and `shared/roleLines.ts` (role lines, built
on `c-remove-relocate`), `status-and-scope-plan.md` § 8 (owner answers),
`coverage-check.md` (items missing on three real jobs), `BidExtrasPanel.tsx`
(flat job charges, `expense_items` / `bid_expenses`), the productivity rule
in CLAUDE.md § "Company defaults vs per-bid overrides" (modifiers ADD, the
productivity factor multiplies afterwards).

---

## 1. Footage with no plans — pick a run type, type feet

**Most important.** Today a run type's pipe, wire and ground reach a bid
only from TRACED runs, and a trace needs a sheet: `takeoff_runs.sheetId` is
`NOT NULL` (`drizzle/schema.ts`, `takeoffRuns`). A job with no plans can
count devices on this screen but cannot price a foot of wire.

### What exists (reuse, do not rebuild)

- **Run types** (`takeoff_run_types`) already know their pipe, conductors,
  ground, waste, fittings and extras.
- **Run-type bid lines** (`bid_line_items.takeoffRunTypeId` +
  `runMaterialRole`) already price ONE line per type per material, with the
  footage derived live (`groupRunFootage`). Six homeruns of 1/2" EMT are one
  purchase, and that rule stays the same.
- **A typed length on a run** (`takeoff_runs.typedLengthInches`, 0091)
  already exists, but only on a run that has a sheet.

### What is new

The search box also finds **run types** ("12/2 MC", "1/2 emt"), marked
**ft** in the results. Picking one turns the quantity box into **feet**, and
Enter adds that footage. The footage feeds the SAME run-type lines a traced
run feeds, so pipe, wire, ground, waste, couplings and extras all come out
of the one existing path. There is no second pricing model.

- **Same type again adds to it**, the way the screen merges an assembly
  counted twice (`merge` on `bids.addAssembly`). Per room once rooms exist
  (§ 3).
- **The row says what it is:** "12/2 MC Copper — 240 ft typed (no plans)".
  It is a first-class line, not a degraded one.
- **Where it is stored: a new table, NOT a sheetless `takeoff_runs` row.**
  Making `sheetId` nullable changes what every reader of `takeoff_runs`
  can assume (scale, points, drops, the panel per sheet), and a meaning
  change there is the expensive kind. A typed run has no points, no scale
  and no sheet, so it gets a table of its own that `groupRunFootage` reads
  as one more input.

### Safe default and fix-its

- Nothing changes on a bid until somebody types feet.
- A run type with **no material priced** shows "Not priced" on its lines as
  today, with the existing fix-it. Nothing new.
- **Typed feet do not include drops**, because there are no devices to drop
  to. The row shows a muted hint, "typed feet — include ups and downs", and
  a **"+10% for ups and downs"** button that adds it once (a little high
  beats low). Under "More options" the default is **off**, so a typed 240
  stays 240 unless somebody asks for the extra.

### Moves a number?

**Only on a bid where somebody types feet.** No existing bid has a typed
run, so none moves (to be proved with `scripts/bidTotals.mts` before and
after, as § 9 says).

### Migration (Track A) — Q-M1, additive, step 1

```sql
CREATE TABLE `bid_typed_runs` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `bidId` int NOT NULL,
  `userId` int NOT NULL,
  `runTypeId` int NOT NULL,
  `roomId` int NULL,                 -- § 3; NULL = the whole job
  `kind` enum('run','homerun') NOT NULL DEFAULT 'run',
  `feet` decimal(10,2) NULL,         -- kind 'run': the typed footage
  `circuitCount` int NULL,           -- kind 'homerun' (§ 2)
  `averageFt` decimal(8,2) NULL,     -- kind 'homerun'; NULL = the bid's
  `note` varchar(255) NULL,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(),
  CONSTRAINT `btr_bid_fk`  FOREIGN KEY (`bidId`)  REFERENCES `bids`(`id`) ON DELETE CASCADE,
  CONSTRAINT `btr_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  CONSTRAINT `btr_type_fk` FOREIGN KEY (`runTypeId`) REFERENCES `takeoff_run_types`(`id`) ON DELETE RESTRICT,
  INDEX `btr_bid_idx` (`bidId`)
);
-- roomId's foreign key is added in Q-M2, which creates bid_rooms.
```

`RESTRICT` on the run type follows `bid_line_items.takeoffRunTypeId`:
tidying a palette must never take footage off a bid.

---

## 2. Homeruns by average — circuits × average feet

### What exists

`bids.homerunMethod` / `homerunAverageFt` / `homerunMinimumFt` (0127) and
the Average method in `homerun-footage-plan.md` § 0. But Average there is
per CIRCUIT FOUND ON A SHEET. With no plans there are no circuits, so
nothing produces a homerun.

### What is new

One search result, **"Homeruns"**. Picking it asks for two numbers on the
same line: **circuits** (the quantity box) and **average feet** (prefilled
from `bids.homerunAverageFt` when set). Enter adds a typed-run row of kind
`homerun` with a run type (the last one used, else the company's homerun
type, else it asks). Footage = circuits × (average + makeup).

- **Makeup at the panel is added: 5 ft per homerun**, the same rule as
  measured homeruns (`homerun-footage-plan.md` § 0, "makeup stays separate
  (5 ft at the panel)"). The row shows it: "14 homeruns × (45 + 5 makeup)
  ft = 700 ft".
- **The average means the whole length, ups and downs included.** On a
  screen with no plans there is no height to add verticals from, and the
  person typing an average is thinking in total feet. The label says so:
  "average length, including up and down". (Question Q2.)
- The bid's routing factor (`homerunRoutingPct`) applies if set, as it does
  to measured homeruns. Its default is none, as today.

### Safe default and fix-it

- **Average not set:** the row says "Not priced — set the average length",
  with a **"Set average"** button that focuses the box. Never 0 ft.
- Run type not picked: "Pick a run type", with the picker right there.

### Moves a number?

Only on bids where somebody adds a homeruns row. That is new, so no
existing bid moves.

### Migration

None beyond Q-M1 (the `kind`, `circuitCount` and `averageFt` columns are in
it).

---

## 3. Rooms / areas, each with its own difficulty factor (ADDED)

### What exists

- **Modifiers ADD to each other and are frozen per line**
  (`snapshotModifierPct`), and the **productivity factor multiplies
  afterwards** (`hours × (1 + modifiers) × (1 + productivity)`).
- `bid_height_areas` (0130) are DRAWN regions on a sheet, carrying a
  height. They are not rooms you can name while walking a house, and
  making their `sheetId` / `region` nullable would change what they mean.
  This plan **does not reuse them**. (Question Q4 asks whether to link the
  two later.)

### What is new

A **room strip** above the list: "Whole job · Kitchen · Basement +15% ·
Attic +25% · + Room". The picked room is where Enter adds the next line or
footage. Every line and every typed run carries its room. The list groups
by room, with a subtotal per room.

- **Difficulty is ADDED to the line's modifiers, never multiplied** (owner):
  `hours × (1 + line modifiers + room %) × (1 + productivity)`. A line with
  +10% modifiers in a +25% attic is +35%, not +37.5%.
- **The room's % is a live setting, not a snapshot.** It follows the
  "settings are inherited, not copied" rule: change the attic to +30% and
  every attic line re-prices. What never moves is the line's own frozen
  `snapshotModifierPct`. A locked bid (`quantitiesLockedAt`) still locks
  its quantities, and a room change does not touch them.
- **Labor only.** A room factor never touches material, job costs or typed
  feet. Typed footage in a room has its labor from the run type's lines,
  and the room % applies to those labor hours the same way.
- **Merging** an assembly counted twice becomes per (assembly, room). Six
  receptacles in the kitchen and four in the basement are two lines,
  because they price differently.
- The breakdown shows the steps apart (modifiers, room, productivity), as
  it already shows modifiers and productivity apart.

### Safe default and fix-its

- **No room picked = "Whole job", 0%.** Every existing line is Whole job,
  so nothing moves.
- A new room starts at **0%** with the box focused. The room chip says
  "+0%" until a factor is typed, which is honest and not a warning.
- Moving a line to another room is a menu item on the line, so a mistake
  has a fix right on the line.

### Moves a number?

**Yes, on lines in a room with a factor other than 0.** Only on bids that
create rooms, which no existing bid has.

### Migration (Track A) — Q-M2, additive, step 1

```sql
CREATE TABLE `bid_rooms` (
  `id` int AUTO_INCREMENT PRIMARY KEY,
  `bidId` int NOT NULL,
  `userId` int NOT NULL,
  `name` varchar(64) NOT NULL,
  `difficultyPct` decimal(6,4) NULL,   -- NULL = 0, not set; read as no factor
  `note` text NULL,                    -- § 7, the walking note
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE now(),
  CONSTRAINT `br_bid_fk`  FOREIGN KEY (`bidId`)  REFERENCES `bids`(`id`) ON DELETE CASCADE,
  CONSTRAINT `br_user_fk` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `br_bid_idx` (`bidId`)
);
ALTER TABLE `bid_line_items` ADD COLUMN `roomId` int NULL,
  ADD CONSTRAINT `bli_room_fk` FOREIGN KEY (`roomId`) REFERENCES `bid_rooms`(`id`) ON DELETE SET NULL;
ALTER TABLE `bid_typed_runs`
  ADD CONSTRAINT `btr_room_fk` FOREIGN KEY (`roomId`) REFERENCES `bid_rooms`(`id`) ON DELETE SET NULL;
```

`ON DELETE SET NULL` on the line is deliberate and is the one number to
read twice. Deleting a room moves its lines to Whole job, which drops their
room % and so moves the total DOWN. The screen must ask first: "Delete
Attic? Its 12 lines move to Whole job and lose the +25%." Cascading instead
would delete priced lines, which is worse.

---

## 4. New / remove / relocate / staying per line

### What exists

`bid_line_items.lineRole` enum('install','remove','relocate') (0115), and
the role lines built on `c-remove-relocate`: labor only, hours from the
assembly's `removeLaborHours` / `relocateLaborHours` (0110), "Not priced"
plus "Set remove hours" when unset (`shared/roleLines.ts`,
`HandPricedLineFields.tsx`).

### What is new

A **status chip on the quantity row**: **New** (default) · Remove ·
Relocate · Staying. It is under "More options" until first used on a bid,
then it stays shown on that bid. The chip applies to the next Enter, and
the chip on an added line shows what it is.

- **Remove / Relocate** add a role line through the same function the
  takeoff uses (`addLaborRoleLinesToBid`'s rules, hours from
  `laborRoleHours`, with no count override because there is no count). The
  line is named "Remove duplex receptacle". It is labor only and has no
  material, the owner's "only NEW prices material".
- **Merging role lines:** a role line has no `assemblyId` on purpose (see
  `remove-relocate-labor-plan.md`). So Quick bid merges a second "Remove
  duplex" into the line with the same `lineRole`, the same frozen name, the
  same room and no takeoff group. That is enough on one bid. The name is
  frozen at add, so a later library rename cannot split it.
- **Staying** puts the device on the bid at **no charge**: "Duplex
  receptacle × 6 — staying, no charge". It is what the proposal's "existing
  to remain" reads (`status-and-scope-plan.md` § 8 Q2 wording). It is never
  "Not priced", and it never reaches the materials list or the drops.

### Safe default and fix-it

- Default chip **New**, which is today's behaviour.
- A remove/relocate line with no hours shows "Not priced" and **"Set
  remove hours"** (built). The assembly editor's hours under "More options"
  is the set-once fix.

### Moves a number?

- Remove / Relocate: **yes, up**, and only when used, with no hours making
  it "Not priced" rather than $0.
- Staying: **no** ($0 by definition).

### Migration (Track A) — Q-M3, additive, step 1

```sql
ALTER TABLE `bid_line_items`
  MODIFY COLUMN `lineRole` enum('install','remove','relocate','existing')
  NOT NULL DEFAULT 'install';
```

Adding a value at the END of an enum is additive. Old code never writes
`existing`, and every existing row keeps its value. **Read before applying:
the unique key `(bidId, takeoffGroupId, lineRole)` from 0115 must survive
the MODIFY unchanged.** The rehearsal checks `SHOW INDEX`. Code that ships
with it: `lineNotPriced` treats `existing` as priced at zero, and the
materials list, drops and markup skip it, the same way they skip role
lines. That code must ship before anything writes the value. Since only new
code writes it, the order is migrate, then deploy.

---

## 5. Job-type checklists — the things people forget

### What exists

`coverage-check.md` lists what was missing on three real jobs, and the
search box can add any of it.

### What is new

A **"Check for forgotten items"** button at the foot of the list. It is not
a modal on the loop, and never automatic. It opens a short list for the
job type. The type is picked once per bid and suggested from the bid's
project type (residential / commercial):

| Job type            | Items (shipped content, editable later)                                                                                                                                               |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Service upgrade     | Permit · utility disconnect/reconnect · grounding electrode (rods) · water bond · gas bond · surge protection · panel labeling · meter base                                           |
| Remodel / addition  | Permit · smoke/CO (interconnected) · GFCI (kitchen, bath, laundry, outdoor, garage) · AFCI breakers · cover plates · patch and repair · bonding · dumpster                            |
| New house           | Permit · temp power · smoke/CO · GFCI · AFCI · grounding electrode (Ufer/rods) · water + gas bond · surge protection · exterior receptacles · doorbell/low voltage · panel labeling   |
| Commercial / retail | Permit · exit/emergency · fire alarm tie-in · GFCI (break room, outdoor, roof) · roof-top receptacle · fire caulk at penetrations · panel directory · lift rental · after-hours labor |

Each item reads the bid and shows one of three states, each with its
button:

- **On the bid** (it shows what matched: "found: Smoke/CO detector × 4"),
  so a wrong match is visible.
- **Not found → "Add"**, which puts the search box on that item with the
  room picked. Then it is the normal type → quantity → Enter.
- **"Not needed on this job"**, saved per bid, and reversible.

Matching is by assembly/material category and search words. **It is a
measurement and can miss** (CLAUDE.md § "a grep measures the pattern you
typed"). So it never says "all clear". It says "N of M found", and a
not-found item is a question, not an error.

The content ships in code (`shared/quickBidChecklists.ts`, like
`shared/navigationTargets.ts`), not as a DB seed, so it needs no seed work
from Track A. Company-editable lists come later and would follow the
materials fork pattern (NULL `userId` = shipped). See Q5.

### Moves a number?

**No.** It only offers. A number moves only when somebody presses Add and
counts something, the same as typing it.

### Migration (Track A) — Q-M4, additive, step 1

```sql
ALTER TABLE `bids` ADD COLUMN `checklistJobType` varchar(32) NULL;  -- NULL = not picked
CREATE TABLE `bid_checklist_answers` (
  `bidId` int NOT NULL,
  `itemKey` varchar(64) NOT NULL,
  `answer` enum('not_needed') NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  PRIMARY KEY (`bidId`, `itemKey`),
  CONSTRAINT `bca_bid_fk` FOREIGN KEY (`bidId`) REFERENCES `bids`(`id`) ON DELETE CASCADE
);
```

---

## 6. One spot for job costs — permit, drive time, lift, dumpster

### What exists

`BidExtrasPanel` with `expense_items` (the company's list) and
`bid_expenses` (frozen flat amounts on a bid, pick-or-one-off, "Save to my
list" afterwards). The bid totals already add them ("Additional expenses").
**It is on the bid screen and not on Quick bid.**

### What is new

A **"Job costs"** row on Quick bid that opens the SAME panel. It is one
component, not a copy (CLAUDE.md § "Copying a layout does not copy the
behaviour"). It gains quick tiles for the four the owner named:

- **Permit**: an amount.
- **Lift rental**: days × rate per day.
- **Dumpster**: an amount.
- **Drive time**: trips × hours per trip × the bid's labor rate.

The calculator tiles write ONE flat `bid_expenses` row, and the working is
kept in its `notes`: "Drive time: 6 trips × 1.5 h × $85/h". It is a frozen
amount like every other expense, so it needs no new pricing path and no
migration. To change it, the person opens the row and retypes it.

> **CORRECTED 2026-10-10 (build): `bid_expenses` has NO `notes` column**
> (`drizzle/schema.ts` ~1852; only `expense_items` has one). This plan said
> otherwise without checking. The working cannot go in the NAME instead,
> because expense names print on the customer's proposal
> (`ProposalSheet.tsx` ~597), and "× $85/h" would show the labor rate.
> **Built without it:** the tiles shipped on `c-quick-bid` (`200e310`); the
> working shows live in the tile before adding and in the "Added …" message,
> and is not stored. **Storing it needs Q-M5 below (Track A).**
>
> "The bid's labor rate" also does not exist: a bid has no rate of its own.
> Built as the company's DEFAULT labor rate (`pricing_defaults.defaultLaborRateId`,
> the one traced-run lines are priced at), prefilled and editable in the
> tile. With no default set, the box is blank and Enter is refused in its
> own words.

Typing "permit" or "dumpster" in the main search box also finds these
tiles, so the type → Enter loop reaches them too.

### Safe default and fix-it

- **A tile adds nothing until an amount is typed.** It opens with the box
  focused, and Enter is refused on blank. A blank tile never adds $0
  (CLAUDE.md: unset is not zero, money-wise on a bid).
- Drive time with **no labor rate on the bid** says "No labor rate — set
  one", with the button that opens the rate. It never multiplies by 0.

### Moves a number?

**Yes, by exactly what is typed, and only when added.** Expenses are
already in the total, so nothing about existing bids changes.

### Migration

**None for the tiles (built). Q-M5 to store the working** — additive,
step 1, safe before or after the code; nothing reads it until the code that
writes the note ships. NULL = no note (every existing charge). Hand-written;
do not `drizzle-kit generate` it.

```sql
-- Q-M5: a charge's working, shown on the bid screen, NEVER printed on the
-- customer quote (it can carry the labor rate).
ALTER TABLE `bid_expenses` ADD `notes` varchar(512) NULL;
```

The code half after it lands (C): the tile writes `notes`, the charge row
shows it in small grey text under the name on the bid screen and Quick bid
only, and `ProposalSheet` / quote exports keep NOT reading it, with a test
pinning that.

---

## 7. Phone-friendly, for walking a job

### What exists

`useCoarsePointer` already changes parts of Quick bid on touch, and
`track-b-phone-and-readability-plan.md` covers the Plans screen.

### What is new (touch only, so the keyboard screen is unchanged)

- **48 px targets** on every control, and **− / + steppers** beside the
  quantity, because a thumb cannot select-and-retype easily.
- **Most-used tiles** (`MostUsedRow`) as big buttons under the search box.
  One tap adds 1 to the picked room.
- **Room strip at the top, sticky.** Walking is room by room.
- **"Note" on each room**: a quick text note (`bid_rooms.note` from Q-M2),
  e.g. "panel in garage, 100A, full". It shows on the bid screen under the
  room, and is never printed on the customer quote unless somebody copies
  it there.
- **Nothing important under the bottom edge**: `h-dvh`, one scroll region,
  and the total pinned (CLAUDE.md § Responsiveness 4). It is checked with
  `pnpm device:audit` at phone width.
- **No signal in a basement.** An add that fails to save stays on screen
  marked **"Not saved — Retry"**, with the button on the row. It is never
  silently dropped, and the total says "+ N not saved". A real offline
  queue (like `helixbid:stamp-queue:`) is a later piece. See Q7.

### Moves a number?

**No.**

### Migration

None beyond Q-M2's `note`.

---

## 8. Summary — which pieces change bid numbers

| #   | Piece               | Moves a number?                                              | Existing bids                   |
| --- | ------------------- | ------------------------------------------------------------ | ------------------------------- |
| 1   | Typed footage       | **Yes**, up, when feet are typed                             | none move (no typed runs exist) |
| 2   | Homeruns by average | **Yes**, up, when added (+5 ft makeup each)                  | none move                       |
| 3   | Rooms + difficulty  | **Yes**, on lines in a room with a factor ≠ 0 (added, labor) | none move (all "Whole job")     |
| 4   | Status per line     | **Yes**, up, for remove/relocate; staying $0                 | none move                       |
| 5   | Checklists          | No (only offers; Add is a normal count)                      | —                               |
| 6   | Job costs           | **Yes**, by the typed amount, when added                     | none move                       |
| 7   | Phone use           | No                                                           | —                               |

**Proof required at build time, per piece:** `scripts/bidTotals.mts`
before and after on a migrated copy reads "all N bid(s): totalDue
unchanged", and the plan's count of bids using the new thing is 0. The same
check was done for remove/relocate labor: 0 of 4,235 bids moved.

## 9. Migrations — all Track A's, all additive (step 1), step 3 empty

| Draft | For  | What                                                                 |
| ----- | ---- | -------------------------------------------------------------------- |
| Q-M1  | 1, 2 | `bid_typed_runs`                                                     |
| Q-M2  | 3, 7 | `bid_rooms`; `bid_line_items.roomId`; `bid_typed_runs.roomId` FK     |
| Q-M3  | 4    | `bid_line_items.lineRole` gains `'existing'` (enum value at the end) |
| Q-M4  | 5    | `bids.checklistJobType`; `bid_checklist_answers`                     |
| Q-M5  | 6    | `bid_expenses.notes` — only to STORE the tiles' working (§ 6)        |

Numbers are A's to assign. The latest on disk is `0143_labor_steps.sql`,
and A's list (`migrations-next-batch.md`) may have taken more since. **None
is a meaning migration**, because every new column is NULL or defaults to
today's meaning, and the code reads NULL as "what happens today". So each
can go ahead of its code. Q-M2 must apply after Q-M1, because it adds the
foreign key on `bid_typed_runs.roomId`.

## 10. Build order

1. **§ 6 Job costs on Quick bid**: no migration, the smallest change, and it
   is useful on every job.
2. **§ 1 + § 2 typed footage and homeruns** (Q-M1). They are the biggest
   gap: a no-plans job cannot price wire today.
3. **§ 3 rooms** (Q-M2), then **§ 7 phone**, which needs rooms for its
   strip and notes.
4. **§ 4 status chip** (Q-M3). Remove/relocate reuses the built role lines.
5. **§ 5 checklists** (Q-M4).

## 11. Questions for the owner — each with a suggested answer

| Q   | Question                                                                                               | Suggested answer                                                                                                                   | Moves a number?      |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | Typed footage: offer "+10% for ups and downs" off by default, or on?                                   | **Off by default, one tap to add.** It is a guess about feet the person already typed.                                             | **Yes** if on        |
| 2   | Homerun average: does it include ups and downs, or are verticals added from job heights like on plans? | **Includes them**, as the label says. With no plans, there are no heights to add from.                                             | **Yes**              |
| 3   | Homerun makeup: add 5 ft per homerun on top of the average?                                            | **Yes**, the same rule as plan homeruns. A little high beats low.                                                                  | **Yes**              |
| 4   | Rooms vs drawn height areas: link them later (a room drawn on a sheet), or keep them separate?         | **Separate for now.** A room is a name and a factor. Linking them is a later plan.                                                 | No                   |
| 5   | Checklist content: shipped in code now, company-editable later?                                        | **Yes.** The four lists above, shipped as code. Editing follows the materials fork pattern when asked for.                         | No                   |
| 6   | Drive time: a flat expense (trips × hours × rate frozen), or labor hours on the bid?                   | **A flat expense** with the working in its note. It is not install labor, so it should not take modifiers, room % or productivity. | **Yes** (when added) |
| 7   | No signal: is "Not saved — Retry" enough for now, or is an offline queue needed first?                 | **Retry first.** An offline queue is its own piece, using the stamp-queue pattern.                                                 | No                   |
| 8   | Room factor on typed footage labor too, or devices only?                                               | **Both.** Pulling wire in an attic is the hard part.                                                                               | **Yes**              |
| 9   | Staying devices: listed on the customer proposal as "existing to remain", or bid screen only?          | **Bid screen and proposal scope**, worded per `status-and-scope-plan.md` § 8 Q2. No price shows.                                   | No                   |

Questions 1, 2, 3, 6 and 8 change bid numbers. The owner decides them.

## 12. OWNER ANSWERS (2026-10-10, evening) — these override § 11 where they differ

| Q   | Answer                                                                                                                                                                                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **The extra 10% for ups and downs on typed runs is OFF by default, one tap to turn on.** Off adds nothing; on adds 10% to that run's typed feet and the run says so.                             |
| 2   | **The homerun average INCLUDES ups and downs, and its label says so** ("average feet per homerun, ups and downs included"). No verticals are added on top from job heights.                      |
| 3   | **Yes: 5 ft of makeup at the panel per homerun**, on top of the average, the same rule as plan homeruns.                                                                                         |
| 4   | Not answered; the suggestion (separate for now) stands until the owner says otherwise. Moves no number.                                                                                          |
| 5   | Not answered; the suggestion stands. Moves no number.                                                                                                                                            |
| 6   | **Drive time is a FLAT COST, not labor hours**: trips × hours per trip × rate, frozen as one `bid_expenses` amount with the working in its note. It takes no modifiers, room %, or productivity. |
| 7   | Not answered; the suggestion ("Not saved — Retry" first) stands. Moves no number.                                                                                                                |
| 8   | **Yes: a room's difficulty factor applies to typed wire runs in that room too, LABOR ONLY.** Feet and material are never scaled by it.                                                           |
| 9   | Not answered here; see `status-and-scope-plan.md` § 8 Q2 for the wording. Moves no number.                                                                                                       |

All five answers that move a number (1, 2, 3, 6, 8) agree with the § 11
suggestions, so §§ 1, 2, 3 and 6 stand as written. None moves an existing
bid: they apply only to typed runs, homeruns, rooms and job costs, none of
which exist on any bid yet. `scripts/bidTotals.mts` before and after each
build still has to say so.
