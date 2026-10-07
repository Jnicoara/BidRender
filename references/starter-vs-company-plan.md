# Starter vs company — what reaches EVERY account, and what stays in ONE. PLAN, 2026-10-07

Track A, at the owner's request ("needs to be sure what ships to every account
(shared starter) vs what stays in HIS company only"). **Plan only — no code,
no migration.** Facts below were found by reading the code, file:line cited;
nothing was run against a database.

## The two kinds of row — one sentence each

- **Shared starter** = a library row with `userId IS NULL` (materials, labor
  rates, modifiers, assemblies, kits, run types). Every company sees it until
  that company changes it. Only the SEED (`server/seedShippedLibrary.ts`, run
  on every server start) writes these.
- **A company's own** = the same tables with `userId` = the company OWNER's
  id (`ctx.scope.dataUserId`). Editing a starter row on any screen FORKS it:
  a copy with the company's `userId` and `baselineId` pointing back at the
  starter. From then on that company sees its copy; nobody else does.

## 1. Every way data gets in — and where it lands

| Way in                                                                                          | Lands in                          | Proof                                                                                                                                                                                               |
| ----------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Seed code** (`server/seed/**`, applied on every server start)                                 | **SHARED only**                   | every pass filters `isNull(userId)` / inserts `userId: null` (`server/db.ts` seedBaselineMaterialsFrom ~2126, labor ~2556, assemblies ~3673, run types ~2597)                                       |
| `scripts/seedBaseline.mts`, `dropOrphanBaselines.mts --delete`, `repairStarterFixtureLines.mts` | **SHARED** (by hand, guarded)     | same seed functions / `isNull(userId)`; `assertWritableDatabase` refuses a remote DB without `ALLOW_REMOTE_DATABASE=yes`                                                                            |
| **Pricing sheet** (`pricing/*.xlsx`, `buildPricingSheet.mts`, `buildLaborSheet.mts`)            | **Nowhere yet**                   | they only READ the catalog and WRITE spreadsheets. **No tool reads the sheet back into the seed files.**                                                                                            |
| **"Import labor sheet"** button (`materials.importLaborSheet`, materialsRouter.ts:638)          | **HIS COMPANY only**              | `userId = ctx.scope.dataUserId` (:646); forks a starter row first (:677, :724); writes only hours                                                                                                   |
| **Supplier price import** (`materials.importPrices`, :556)                                      | **HIS COMPANY only**              | forks the starter row (:604), writes cost / supplier / date; unmatched names are reported, never created                                                                                            |
| Editing on screens — materials, labor rates, modifiers, assemblies, kits, run types             | **HIS COMPANY only**              | create inserts `userId: dataUserId`; update forks a starter row first (`forkMaterial` db.ts:1858, `forkLaborRate` :2489, `forkAssembly` :3514 …); every update/delete filters `userId = dataUserId` |
| First-run "what's your labor rate" (`onboarding.setStarterRate`)                                | **HIS COMPANY only**              | `setLaborRateHourlyCost` forks, then updates (db.ts:2472)                                                                                                                                           |
| Revert to shipped / archive / delete                                                            | **HIS COMPANY only**              | revert writes `where id AND userId` and only READS the starter (db.ts:1931)                                                                                                                         |
| Pricing defaults, sales tax, markup bands                                                       | **HIS COMPANY only**              | no shared row exists; `markup_rules.userId` is NOT NULL; starter bands are code, inert until accepted                                                                                               |
| Admin screens (AI spend, pricing problems, seat limits, access tier)                            | **Neither**                       | no admin procedure touches a library table                                                                                                                                                          |
| AI alias suggestions                                                                            | **Neither** until saved           | returns suggestions; saving is an ordinary (company) update                                                                                                                                         |
| Boot pass on company rows (`backfillMaterialMetadata`, 2nd pass)                                | **HIS COMPANY**, NULL fields only | fills category / aliases / defaultQty / raceway facts where the copy has NULL; never price or hours                                                                                                 |

**So "both" never happens.** A single action changes the shared starter or
one company — never both at once.

## 2. Leaks, and things that would land in the wrong place

**(a) Can his prices or hours leak into the shared starter? — No path found.**
Every write a logged-in user can trigger, admin included, forks first or is
filtered to his company. Only the seed and three guarded scripts write
`userId IS NULL` rows, and they write seed-file values, never user input.

**One indirect channel, worth knowing:** a hand edit made in SQL directly on a
starter row, in a column the boot pass does NOT re-stamp (`unitOfSale`,
`laborHours`, `fieldBendLaborHours`, `brandNote`, `supplierName`), stays — and
is then copied into every company's future forks (`forkMaterial` copies the
starter's content) and every revert. **Rule: never edit a starter row in SQL.**

**(b) Things meant to be shared that would land in his company only:**

1. **The starter labor-units sheet** (`pricing/labor-units-starter.xlsx`).
   Importing it with the "Import labor sheet" button — from his account or
   any — writes HIS company's copies only. Every other shop gets nothing.
   - The material seed has **no `laborHours` at all** today, so there is no
     shared place for unit hours yet.
   - Assembly `baseLaborHours` is in the seed but **insert-only**: changing it
     in the seed reaches brand-new databases and never existing ones.
2. **The pricing sheet uploaded as a supplier price list** (`importPrices`) —
   his company only. CLAUDE.md already says the starter prices go into the
   SEED FILES; nothing does that yet.
3. **Typing starter prices or rates on screens from his own login** — his
   company only, and it ALSO hides the shared starter from himself (he sees
   his fork), so he cannot even see whether the starter changed.

**(c) What the boot does to the shared starter every start:** re-stamps
materials' `category`, `searchAliases`, `description`, `trade`,
**`costPerUnit`**, `defaultQty` and raceway facts, and labor rates'
`hourlyCost` / `annualSalary` / `annualHours`, from the seed files. A shared
price typed anywhere else would be overwritten on the next deploy — which is
exactly why the seed file must be where starter content is authored.

## 3. The admin "baseline" login and screen

**What it must do (owner):** edit the shared starter; reach every shop except
items a shop already changed; never move a sent bid; work on a brand-new
database.

**How each rule is already true or must be made true:**

| Rule                                           | Status                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Reaches every shop except items a shop changed | **Already true** of anything that changes `userId IS NULL` rows: a shop that changed an item reads its fork (`mergeLibraryRows`), and the re-stamp is scoped `isNull(userId)` (`server/seedPreservesUserPrices.test.ts` goes red otherwise).                                                                                                                                                                                     |
| Sent bids never move                           | **Already true for price, hours and rate**: a bid line freezes them at add time (`snapshotMaterialCost`, `snapshotLaborHours`, `snapshotLaborRate`). **One exception to close first:** older lines read their recipe live (todo.md, "WRONG-NUMBER RISK"), so a recipe change can still move a not-priced count on an old line — the one-time `snapshotUnpricedParts` freeze must ship before any starter recipe or price change. |
| Works on a brand-new database                  | **Only the seed files do this.** A new database has only what the seed inserts.                                                                                                                                                                                                                                                                                                                                                  |
| Edits the shared starter                       | Today only the seed does; nothing on a screen can.                                                                                                                                                                                                                                                                                                                                                                               |

**The design consequence:** an admin screen that writes starter rows in the
database breaks rule 3 (a new database never gets them) AND is overwritten on
the next start (the re-stamp). So the screen has two honest shapes:

- **Shape A — the screen writes the SEED FILES** (it produces a change to
  `server/seed/**` that is committed and deployed). Keeps one source of truth.
  Needs a way to commit from a running app — not appropriate for a hosted app.
- **Shape B — the shared starter moves into the database for good:** a
  `starter_*` source table becomes the truth, the seed files become the
  first-boot import only, and a new database is seeded from an EXPORT of the
  starter tables. Larger: new tables, an export/import, the re-stamp rewritten,
  an admin role that is not a company, an audit of who changed what.

**Recommendation: a file loader run by Track A is enough for now, and the
screen must NOT exist before he fills the sheets.** Reasons:

1. The loader satisfies all four rules today with no new risk: sheet → seed
   modules → read the diff → commit → deploy → every database re-stamped on
   start, a new database seeded the same.
2. The screen is Shape B, a release of its own with migrations; building it
   first would delay the pricing work by weeks and put a new writer next to
   the shared starter before the guards (example-price tag, recipe freeze)
   exist.
3. Filling the sheets does not depend on it — he fills spreadsheets either way.

**What the loader needs before the first real prices load** (in order):

1. `materials.isExamplePrice` + `bid_line_items.snapshotPriceWasExample`
   (Batch 5), so a shipped price shows "Example price" and printing warns.
2. The `snapshotUnpricedParts` one-time freeze (todo.md), so nothing old moves.
3. Seed fields for unit hours: `laborHours` / `fieldBendLaborHours` in the
   material seed, and a re-stamp pass for them and for assembly
   `baseLaborHours` (insert-only today). Without it the labor sheet can only
   ever be a per-company import.
4. `pricing/loadStarterSheet.mts` (new): reads the filled sheet, writes the
   seed modules, refuses a row it cannot match by id/name, prints a
   before/after of every changed value. Run by Track A, reviewed, committed.

**The screen later (Shape B)** — when the owner wants to edit the starter
without Track A: a `role = "starter-editor"` login that belongs to no company,
a Starter screen listing shared rows with "changed by N shops" beside each,
edits written to the starter tables with an audit row, and the seed files
retired to first-boot. Its own plan when the time comes.

### What HE should do in the meantime

- **Fill the sheets; do not type starter values into his own account.** What
  he types on screens is his company's — right for HIS bids, invisible to
  every other shop.
- When he wants to see the shared starter as a new shop sees it: a separate
  login with no edits (a fresh company), not his own.

## 3b. Labor rates

### How they are stored today

- **One row per worker type (role)**: `labor_rates` (`drizzle/schema.ts`
  ~893): `name`, `rateType` (`hourly` | `salary`), `trade`, `hourlyCost`,
  `annualSalary`, `annualHours`, `isActive`, plus the ownership columns.
- **One number, no breakdown.** `hourlyCost` is whatever the shop types — a
  wage or a loaded rate, the app cannot tell. There is no column for taxes,
  workers' comp, insurance or benefits. A salaried role's rate is worked out
  when read (`effectiveHourlyRate`, shared/pricing.ts), never stored.
- **Shipped roles** (`server/seed/baselineLaborRates.ts`): Apprentice,
  Journeyman, Foreman/Master Electrician, Supervisor (hourly) and Project
  Manager (salary) — **all at $0**, flagged "needs a rate"
  (`shared/laborRatePricing.ts` `needsRate`), re-stamped to $0 on every start.
  **There is no Helper role.**
- **A bid freezes the rate** on each line (`snapshotLaborRate`), so changing a
  rate never moves a sent bid. A bid line with an unrated role prices labor at
  $0 and is flagged.
- The first-run screen already asks for one rate (`FirstRunPage.tsx`, saved by
  `onboarding.setStarterRate`, his company only).

### The plan: shipped EXAMPLE LOADED rates, deliberately high

**The owner's rule: if the example is wrong, better high than low.** A high
example loses a job; a low one wins a job at a loss. Anchor (BLS OEWS, May
2023, national mean hourly WAGE): electricians **$32.60**, helpers--
electricians **$19.83** ([electricians](https://www.bls.gov/oes/2023/may/oes472111.htm),
[helpers](https://www.bls.gov/oes/2023/may/oes473013.htm)). **Re-check against
the current release before shipping** — these are 2023 figures, and the seed
gets a dated comment with the source.

| Role (seed name)           | Example wage | Burden (example) | **Example loaded rate** |
| -------------------------- | ------------ | ---------------- | ----------------------- |
| Foreman/Master Electrician | $50.00       | +41%             | **$70.50/hr**           |
| Journeyman                 | $42.00       | +41%             | **$59.22/hr**           |
| Apprentice                 | $26.00       | +41%             | **$36.66/hr**           |
| Helper (NEW role)          | $24.00       | +41%             | **$33.84/hr**           |

Wages set about 30% above the national mean on purpose. **Example burden,
shown as its parts** (each a starting point for the shop to replace):
payroll taxes (FICA 7.65% + unemployment ~2.35%) **10%**, workers' comp
(electrical class) **7%**, general liability / insurance **4%**, benefits
(health, retirement, paid time off) **20%** = **41%**. Supervisor and Project
Manager stay as they are (set by the shop; no example), since their cost
varies too much to guess usefully.

### Pushing every shop to its own loaded rate

1. **New-shop setup asks for it** — the existing first-run rate step becomes
   "your loaded rate" per role in use, with the breakdown fields (wage, taxes,
   comp, insurance, benefits) and the example pre-filled but visibly tagged.
2. **A banner until it is set** — on the Dashboard and the bid screen: "Your
   bids are using example labor rates. Set your own →" (to Settings ›
   Labor rates). Dismissible per session, back next session, gone when every
   role in use has a rate of the shop's own.
3. **Warn before printing** any bid with a line priced from an example rate —
   the same shape as the example-PRICE warning the owner already decided (a
   warning, not a refusal): "N lines use example labor rates — set your own
   before this goes out". Read from the line's frozen
   `snapshotLaborRateWasExample`, so it cannot change after the fact.
4. **Show the loaded rate as its parts** everywhere it is edited: wage +
   taxes + workers' comp + insurance + benefits = loaded rate, with the total
   computed live. A shop that only knows its loaded number can type it
   directly (breakdown left blank — NULL, never zero).
5. **"Example rate" tag** on every shipped rate the shop has not edited; it
   clears on the shop's first edit (the fork).

### A trap to close in the same change

`needsRate` today means `hourlyCost === 0`. The moment shipped rates are
non-zero, **every unconfigured shop would read as "rate set"** and the
first-run prompt would stop asking. Exactly the `isExamplePrice` problem
CLAUDE.md records for prices. So the example rates ship only TOGETHER WITH
`isExampleRate`, and `needsRate` reads `isExampleRate || hourlyCost === 0`.

### New columns (for the migration list — NO migration yet)

All additive, nullable, no DB default, unless noted:

| Table            | Column                        | Type          | Meaning                                                                                      |
| ---------------- | ----------------------------- | ------------- | -------------------------------------------------------------------------------------------- |
| `labor_rates`    | `isExampleRate`               | BOOLEAN NULL  | TRUE on a shipped example; a fork writes FALSE. NULL = "not an example" (pre-existing rows). |
| `labor_rates`    | `baseWage`                    | DECIMAL(10,4) | the wage part; NULL = not broken down                                                        |
| `labor_rates`    | `payrollTaxPct`               | DECIMAL(6,4)  | 0.1000 = 10%; NULL = not given                                                               |
| `labor_rates`    | `workersCompPct`              | DECIMAL(6,4)  | as above                                                                                     |
| `labor_rates`    | `insurancePct`                | DECIMAL(6,4)  | as above                                                                                     |
| `labor_rates`    | `benefitsPct`                 | DECIMAL(6,4)  | as above                                                                                     |
| `bid_line_items` | `snapshotLaborRateWasExample` | BOOLEAN NULL  | frozen at add time; drives the print warning                                                 |

`hourlyCost` stays THE number every bid uses (the loaded rate). When the
breakdown is filled, the editor writes `hourlyCost = baseWage × (1 + sum of
percents)`; it never derives it on read, so a bid can never re-price itself
from a breakdown change. Recorded in `references/migrations-next-batch.md`,
Batch 5.

**Order:** columns (step 1) → code that reads `isExampleRate` / the snapshot
/ the banner / the warning → only then the seed's example values and the
Helper role. Shipping the numbers first would price every unconfigured
shop's NEW labor lines at example rates with no tag and no warning.

## SHORT ANSWER

- Seed code is the only thing that changes the shared starter; every screen,
  both imports and the first-run prompt change his company only. Nothing does
  both, and no path leaks his numbers into the starter.
- The danger is the reverse: the "starter" labor sheet and a pricing sheet
  loaded through his account land in HIS company only. Starter content must
  go through a file loader into the seed files.
- Admin screen: not before the sheets. A Track A file loader is enough now;
  the screen is a later, larger release (the starter moves into the
  database).
- Labor rates: one number per role today, no breakdown. Ship example loaded
  rates per role (about 30% above the national mean wage + 41% burden), tagged
  "Example rate", with setup prompt, banner and print warning — only together
  with `isExampleRate`.
