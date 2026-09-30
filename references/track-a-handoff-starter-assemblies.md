# Track A handoff — starter assemblies (from Track C, 2026-09-29)

**For Track A's migration batch. Track C writes no migrations** (owner,
2026-09-29). Everything below is what Track A needs to decide and write so the
168 starter assemblies in `references/starter-assemblies-plan.md` can seed.
Nothing here is applied; no `drizzle/` file was added on `track-c`.

Two items. Both are small, and both are **schema changes Track C cannot make**.

---

## H1. Two assembly categories: "Demo & Retrofit" and "General"

**Owner decision, 2026-09-29 (plan Q3):** add both.

**What.** `ASSEMBLY_CATEGORIES` in `drizzle/schema.ts` gains `"Demo & Retrofit"`
and `"General"`, and `assemblies.category` (a MySQL enum) is widened to match —
an `ALTER TABLE assemblies MODIFY category ENUM(…)` listing the five existing
values in their existing order, then the two new ones.

**Classification (CLAUDE.md § three steps): ADDITIVE.** No `UPDATE`; no
existing value changes meaning. Step 1 — apply before the code that seeds rows
into the new values ships. Old code never writes the new values, so the
database being ahead is harmless.

**Ride with R3.** The retail catalog plan's R3 (surface raceway) is waiting on
the same kind of change to `materials.category` for Surface Raceway,
Underground and Service Entrance (`ASSEMBLIES_PLAN.md` § "Three new
categories ride along"). One batch, two `ALTER`s, is the recommendation.

**Hand-write it.** `drizzle-kit generate` re-emits changes since its last
snapshot (CLAUDE.md § "Never run generated migration output"). Read every
statement.

**Who uses them.** Plan groups DR (20 assemblies) → Demo & Retrofit, MS (14)
→ General, except MS6–MS11 which fit Low Voltage/EMS today. Until H1 lands,
those assemblies cannot seed; everything else in the plan can.

**Three catalog rows to move when Service Entrance exists.** Built on `track-c`
2026-09-29 in existing categories, because the owner wanted them now and the
shelf does not exist yet:

| Row                     | Ships in today   | Move to          |
| ----------------------- | ---------------- | ---------------- |
| `2" meter hub`          | Panels           | Service Entrance |
| `2" mast roof flashing` | Conduit Fittings | Service Entrance |
| `2" riser strap`        | Conduit Fittings | Service Entrance |

**Moving them is a seed edit, not a migration**: `backfillMaterialMetadata`
re-stamps `category` on every baseline row from the seed file on startup
(`server/db.ts`). Change the `category` in the seed module and deploy.

---

## H2. "Hours not set" — YES, it needs a migration

**Owner decision, 2026-09-29 (plan Q1):** store a real "not set" and show
"Hours not set", never 0. Clear the placeholder hours on the 8 shipped starters.

**Why a migration.** `assemblies.baseLaborHours` is
`decimal(10,4) NOT NULL DEFAULT '0'` (`drizzle/schema.ts`). There is no value
for "not set" that zero is not already using, and zero is the thing the owner
ruled out. The bid line side already has one: `bid_line_items.snapshotLaborHours`
is nullable and NULL means "not typed yet" (drizzle/0075). The assembly needs
the same.

**It is TWO files, and they are different kinds** — classify each file, never
the batch (CLAUDE.md § three steps):

1. **ADDITIVE — make the column nullable.**
   `ALTER TABLE assemblies MODIFY baseLaborHours DECIMAL(10,4) NULL DEFAULT NULL`.
   No existing value changes, so it goes BEFORE the code (step 1). Drop the
   default too: a `DEFAULT 0` makes "not set" and "deliberately zero" the same
   value again, which is the whole thing being fixed.
2. **MEANING — clear the 8 starters.** An `UPDATE` to a column older than the
   batch, so it is the exception: code FIRST, then this (step 3). Scope it
   tightly:
   - `WHERE userId IS NULL` — shared starter rows only. A company that edited a
     starter holds a FORK with its own `userId`; its hours are the company's
     and must never be touched.
   - `AND name IN (…the 8 names…)` — the names in
     `server/seed/baselineAssemblies.ts`.
   - Existing bid lines are safe by construction: their hours are SNAPSHOT
     (`snapshotLaborHours`), and a snapshot is never rewritten.

**What the code must do before file 2 runs** (step 2 — this is Track C's or
whoever builds the starters, not Track A's; listed so the order is visible):

- `BaselineAssembly.baseLaborHours` becomes `number | null`; the 168 starters
  ship `null`; the seeder writes NULL rather than `toFixed(4)` of a placeholder.
- Every reader of `assemblies.baseLaborHours` treats NULL as NOT SET — never
  `Number(null)`, which is 0 and is exactly the silent zero this removes. Grep
  the column name, not an idiom (CLAUDE.md § "A grep is a measurement"). A
  grep for `baseLaborHours` outside tests on `track-c`, 2026-09-29, hits ten
  files: `server/bidPricing.ts`, `server/db.ts`,
  `server/routers/assembliesRouter.ts`, `closeoutRouter.ts`, `kitsRouter.ts`,
  `server/seed/baselineAssemblies.ts`, `shared/materialLabor.ts`,
  `shared/pricing.ts`, `client/src/pages/AssembliesLibraryPage.tsx` and
  `QuickBidPage.tsx`. Read every hit; that search finds the field name, not
  a value copied into a differently named variable.
- Adding a not-set assembly to a bid snapshots `snapshotLaborHours = NULL`,
  which the bid already understands as "not typed yet" — the line shows "Hours
  not set", and the total says how many lines it leaves out, like "Not priced".
- The builder shows the empty field with a placeholder, via
  `InlineNumberField whenUnset={{ placeholder: "Hours not set" }}` (§ Editing
  fields, rule 6).
- `shared/laborHourDefaults.ts` stops supplying a number to starters. Whether
  it still pre-fills a user's own NEW assembly is a separate question for the
  owner — the decision recorded here covers the shipped starters.

**If step 3 runs before step 2** every one of the 8 starters prices at zero
hours on every new bid, with nothing on screen to say so. That is why the order
matters and why the two files must not travel as one.

---

## What Track A does NOT need to do

- The 11 catalog rows from the plan's § Gaps: built on `track-c`, seed only.
- Purchase-list rounding (plan Q5): built on `track-c` in
  `shared/materialsList.ts` (`orderQty`) — pieces and boxes round UP to whole
  after the sum. No schema. Rounding to whole PACKS waits on pack sizes
  (`references/material-markup.md` D3), which is Track A's existing work.
