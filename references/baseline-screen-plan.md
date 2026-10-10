# Baseline screen — improving the shipped starter on LIVE. PLAN ONLY

Track C. **Plan only: no code, no migration.** First written 2026-10-10
(`eddc870`). **Reworked the same night after the owner's answers and a rule
change (§ 0).** Facts are cited by file and line from `track-c` at `6dbf210`.
The audit in § 9 was read from the code, not run against a database, except
where it says "measured".

**What changed in the rework, in one line:** the first version PUSHED a
starter change into every company that had not touched that number. **The
owner ruled that out.** A starter change now reaches only brand-new
companies; existing companies get it as an **offer** they accept or ignore.

**Builds on, and overrides:**

- `before-beta-checklist.md` § 3, "An admin 'baseline' screen" (owner,
  2026-10-08): the item this plan answers.
- `starter-vs-company-plan.md` § 3 (Track A, 2026-10-07): its Shape B (the
  live database holds the starter) is kept. **Its rule "reaches every shop
  except items a shop changed — already true" is REVERSED by § 0**: under
  the owner's rule that sentence describes the fault, not the goal. That file
  carries a line saying so.
- **CLAUDE.md § "Where a priced catalog lands: THE SEED FILES"** (2026-09-21)
  is overridden for starter content once this is built: the live database
  is the truth and the seed files become an export of it (§ 6). CLAUDE.md is
  changed in the same commit as the boot change, not before.
- **CLAUDE.md § "Settings are inherited, not copied"** is questioned by
  finding F8 (§ 9). It is not overridden here. Q16 asks the owner.
- The "Example price" / "Example hours" rule (owner, 2026-10-07,
  `shared/exampleTags.ts`) is unchanged, and the tag still clears only when
  the shop edits.
- `material-markup.md` D2/D6 (starter markup bands are shown, dated and
  **inert until accepted**). That is already the offer shape; § 2 copies it.

---

## 0. The owner's rule (2026-10-10) — everything below serves it

> The admin screen must be able to **edit, add, hide and improve ANYTHING**
> in the shipped starter (materials, assemblies, hours, defaults, run types)
> over time, but it must **NEVER change an existing company's prices, hours,
> items or bids, EVEN if they still use the shipped "Example" values.**

**Two kinds of update, and only one is held back:**

| Kind                                                                         | Reaches existing companies?                                                                                                               |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Company data**: prices, hours, items, assemblies, defaults, run types      | **Never automatically.** An OFFER: "N starter updates available", old vs new, accept one or all. New companies get the latest.            |
| **App updates**: security, bug fixes, new features, screen changes           | **Always, automatically.**                                                                                                                |
| **App updates that change bid MATH** (e.g. remove/relocate labor, twin fold) | Rule (c), § 8: Active / Won / Lost / locked bids never move. A Draft takes the fix and says "Total changed because…" with the old number. |

**Consequences that drive the design:**

1. **Today a company reads the shared starter row LIVE** until it edits that
   row (`mergeLibraryRows`, `server/db.ts` ~1598). So any change to a shared
   row changes what every unforked company sees, and the price of its next
   line. **Under the rule, a company must stop following the starter.** §
   2 does this by PINNING: before a starter row changes, every existing
   company without its own copy gets one, holding today's values.
2. **The boot re-stamp is a starter change too.** Every server start today
   rewrites shared rows from the seed files: prices, labor hours, raceway
   facts, run-type parts, labor rates (§ 9, F2–F6). Those all reach
   existing companies today. They must go through the same pin-then-offer
   path, or the rule is broken on every deploy.
3. **A shipped default held in CODE is a starter value too.** Mounting
   heights (`SHIPPED_HEIGHT_TYPES`, `shared/takeoffHeights.ts:145`) and bend
   settings (`takeoff_bend_defaults`, NULL = the shipped value) are read
   live. Changing one in a release moves vertical and fitting quantities on
   open bids (F7).

---

## 1. Who can open it — the master account (owner answers Q1, Q2, Q11)

Unchanged from the first version except where marked. Answers recorded:
**Q1 authenticator app, Q2 QR code setup, Q11 copy source fixed in server
settings.**

- **A new role, `starter_editor`, on its own login, with no company.**
  `companyScope` fails closed (`server/_core/companyScope.ts`), so every
  company screen refuses it. The owner's own `admin` account cannot open the
  baseline screen. The two roles never overlap.
- **Made only by a script** (`scripts/createStarterEditor.mts`, behind
  `ALLOW_REMOTE_DATABASE=yes`). Signup can never produce it.
- **Every sign-in asks for a 6-digit authenticator code** (TOTP, RFC 6238,
  about 30 lines of `node:crypto`). It is enrolled once by **QR code**, with
  10 recovery codes shown once and stored hashed. Five wrong codes lock it
  for 15 minutes, and a code is accepted only once.
- **Sessions last 8 hours at most, 30 minutes idle.** The session records
  "second step done", and `starterEditorProcedure` checks it.
- **The secret is encrypted at rest** (`STARTER_TOTP_KEY`).
- **A band across the screen reads "STARTER: changes reach NEW companies;
  existing ones get an offer".** (Reworded for § 0.)
- **Use a separate browser profile**: one browser holds one session.
- Lost phone: a recovery code, else Track A resets with `--reset-2fa`, which
  also sets `sessionsValidAfter`.

---

## 2. Changing an existing starter item = an OFFER (owner, rework item 1)

### The mechanism: pin, then change, then offer

When the starter changes an item in a way that affects a number (§ 3 lists
which fields), ONE function, `applyStarterChange`, does this in one
transaction:

1. **Pin.** For every existing company that has no copy of the item, create
   one: a fork (`userId` = the company, `baselineId` = the starter row)
   holding the item **as it is now**, marked `isPinnedCopy = TRUE`, with
   `baselineVersion` = the starter's current `version`. The Example tags are
   copied, so the item still says "Example price" there. The forking functions
   exist (`forkMaterial` `server/db.ts:1960`, `forkAssembly` :4398,
   `forkLaborRate` :2636). Every stored id already resolves to a company's
   fork (`resolveForkedRow`), so no bid, recipe or run type needs re-pointing.
   **To prove, not assume:** a test that pins every starter row for a
   company and reads its every bid, recipe and run type back unchanged.
2. **Change** the starter row and **bump its `version`**. The column exists
   on materials, labor rates, modifiers and assemblies (schema 688, 919,
   1007, 1053), and **nothing bumps it today**. This makes it mean something.
3. **Log** it (§ 4): old value, new value, version.

**Result:** every existing company sees exactly what it saw before, and so
does its next line. A company created afterwards has no copy, so it reads
the starter, which is the latest. **"New companies get the latest" needs no
code at all.**

**What the pinned copy looks like to the company:** like the starter, not
like "their" item. `isPinnedCopy` is what the Materials and Assemblies
screens read to show it as shipped (Example tag, no "edited" badge, not in
"My changes"). The company's first real edit of it sets
`isPinnedCopy = FALSE`.

### The offer

A company's **offers** are the logged starter changes with a version newer
than its copy's `baselineVersion`, for items where its copy still holds the
OLD value of that field.

- **Where:** "N starter updates available" on the Dashboard, and an
  **Updates** tab on Materials, Assemblies and Settings (defaults). Each row
  shows the item, the field, **old → new**, and the date.
- **Accept one** writes the new value into the company's copy and moves its
  `baselineVersion` forward. **Accept all** does it for every row listed.
  **Ignore** hides the row (it stays under "Ignored", reversible).
- **Items the company edited itself** (its copy's value differs from the old
  starter value) are listed apart: "BidRidge changed this; you have your own
  value (yours $0.48, BidRidge's new $0.55)". They are **never in Accept
  all**; one at a time only (Q18).
- **Accepting moves no existing bid**, because bid lines freeze their
  numbers (§ 9a). It changes the company's NEXT lines.

**Scale, said plainly:** a sheet that changes 1,700 prices pins up to 1,700
rows per existing company. That is trivial at beta size (live has 3
companies) and about 1.7 million rows at 1,000 companies. Past that point,
the cheaper shape is a per-company "starter version" pointer with versioned
starter rows. That is a rewrite of every library read, so it waits until the
row count says it is needed. **Measure it at each release: count companies ×
pinned rows.**

**Owner answers Q5 and Q7 are superseded by this section:** nothing is
pushed, so neither "bring old copies up to date" nor "reach copies made for
another reason" exists any more. Both become offers.

---

## 3. What the screen can do to the starter, field by field

### Number fields — OFFER (pin, change, offer)

Material: price (`costPerUnit`), `laborHours`, `fieldBendLaborHours`,
raceway facts (`stickLengthFeet`, `strapSpacingFeet`, `strapFromBoxFeet`,
`stickJoint`), `defaultQty`. Assembly: `baseLaborHours`,
`overheadLaborHours`, remove/relocate hours, `laborOnly`,
`mountHeightTypeKey`, `laborRateId`, and the parts list (recipe). Labor rate:
every amount. Run type: its parts, waste %, fitting style, extras. Modifier
%. Kit contents. Labor-step minutes (later, Q8).

### Finding fields — reach everyone (no number, no item identity)

Search aliases, category shelf, description, sort order, the Specialty tag.
They help a person FIND an item and change nothing on a bid, so they are
app improvements (§ 0). Q21 confirms this split.

**Names** sit between the two. A name is what a company sees on its bid
screen, but bid lines freeze their own name. Suggested: **an offer** (Q17).

### Units — NEVER changed (owner, rework item 3)

`unitOfSale` (each / foot / box, and per-100-ft pricing) is **never edited
on an existing starter item**. `applyStarterChange` refuses it, and so does
the sheet upload. A unit change is a NEW item plus hiding the old one with
the new one named as its replacement. Reason: every quantity on every bid
using it means "so many of THAT unit"; changing the unit under them changes
what the number means.

### Adding — "New", changes no number (owner, rework item 2)

A new starter item appears in existing companies straight away, with a
**"New"** badge until the company dismisses it. It is shared, not pinned.
Adding an item changes no price, hour or bid; it is one more choice.

- **"New"** = the starter row was created after the company's
  `starterSeenAt` (a new column, starting at the company's creation date).
  "Mark all seen" moves it forward.
- **Exception to check at build:** adding an EXTRA to a shipped run type
  (`seedBaselineRunTypes` adds extras, `server/db.ts` ~2954) is not adding
  an item: it changes what an existing run type produces. That is a
  run-type change, so an OFFER.

### Hiding — never deleting (owner, rework items 2 and 5)

**Hide** is the only removal the screen has. It never hard-deletes anything,
and anything a bid uses stays resolvable (CLAUDE.md § "Retire, never
delete").

- **Hiding affects new companies only.** Every existing company is pinned
  first, so the item stays in its list. Then the starter row is marked
  `hiddenAt` and new companies never see it.
- **Existing companies get an offer:** "BidRidge retired _Wire nut, red_. Hide
  it in yours too?"
- **Never hide a material a company's own assembly uses without a
  replacement.** The hide form asks for a replacement (`replacedById`).
  - With one, the offer reads "Replace with _Wire connector, red_ in your 3
    assemblies, then hide". Accepting swaps the part in the company's OWN
    assemblies, which is an ordinary fork edit, and moves no existing bid.
  - Without one, a company whose assemblies use the item is offered nothing
    but a note: "BidRidge retired this; your 3 assemblies still use it".
    Its copy is never hidden.
- **Starter assemblies hide the same way.** An assembly a company's kit uses
  follows the same replacement rule.
- **Un-hide** is a button, logged like any change.

### Adding your own custom items to the starter later (owner Q10)

Not in this version. **Room planned:** the log's `kind` includes `add`
(below), and "Copy from my company" (§ 7) lists custom items in a separate,
greyed section, "Not yet: adding your own items to the starter". The later
step is a form that asks for what CLAUDE.md § Materials requires of a
shipped item (name, category, search slang) before it can be added.

---

## 4. The change log and undo (owner Q6)

Every starter change (screen, sheet, copy, seed boot, undo, hide, add) is a
**change** inside a **batch**, recording who, when, the row, the field, old →
new, and the version it produced. Pins are recorded per change too
(`starter_change_pins`), so an undo knows which copies it created.

- **Undo one change**: allowed only if the starter row still holds this
  change's new value. It writes the old value back and bumps the version
  again. **It is logged as a change of its own**, so it is an offer too.
  Companies that already accepted the change are offered the undo. **Pinned
  copies are left in place**: removing them could change what a company sees
  if the starter has moved since.
- **Undo a batch (owner Q6): undo the rest and list the ones edited since.**
  Preview first: "408 of 412 can be undone; 4 were changed again since:
  [list]". Confirm undoes the 408 in one transaction.
- **No bid moves on an undo** either.
- **The log stores numbers and ids only.** The screen shows how many
  companies have an offer pending or accepted, never which companies.

---

## 5. Bulk edit — the sheet through the screen (owner Q3, Q4)

- **The browser reads the .xlsx** (a library loaded only on this screen),
  and **the server re-checks every row** with the same shared module
  `pricing/loadStarterSheets.mts` uses. That module is pulled out so the
  script and the screen run one copy of the checks.
- **Any bad row stops the whole upload** and lists every bad row with its
  sheet row number and reason (Q4).
- **A unit that differs from the item's is a bad row** (§ 3).
- **Blank = no change.** Clearing to "not set" is a typed action on screen.
- **Preview, then Confirm.** The preview lists only rows that change, and
  says how many companies will be pinned and offered each one. One batch,
  with the file name and SHA-256 recorded.
- **Download current values** in the same shape, so download, edit and
  upload is the normal round trip.

---

## 6. Seeds and the live starter — one source, measured

- **On LIVE, the shared rows are the starter.** New companies read them
  directly.
- **The boot stops writing number fields to shared rows on its own.** Today
  it re-stamps them every start (F2–F6). Instead, a seed value that differs
  from live goes through `applyStarterChange` with source `seed`: pin, change,
  offer, log. **The cleaner option** (suggested): the boot does NOT apply
  number changes at all on a database that has a `starter_changes` log. It
  lists them on the screen as "Seed file proposes 37 changes: Review", and
  the owner confirms them as one batch. A deploy then never changes the
  starter by itself.
- **The boot's second pass on company rows stops** (F3). It fills NULL
  raceway facts on companies' own copies, and those feed fitting counts.
- **"Export to seed"** writes the seed modules from live, and Track A
  commits them, so a brand-new database starts where live is.
- **Drift is shown**: "Seed files differ from live on N values". The same
  check is `scripts/starterDrift.mts`, read-only.
- **Test (C):** round trip — seed, change through `applyStarterChange`,
  export, re-seed a fresh database, compare. Plus: a pinned company reads
  every bid and recipe unchanged, and the boot changes no company row. Each
  test must fail with its guard removed.

---

## 7. "My changes" and "Copy from my company" (owner Q9, Q11)

- **"My changes" is a tab on Materials and a tab on Assemblies (Q9).** It
  lists every price, labor hour and assembly hour the company typed that
  differs from the starter, with the starter value beside it. **Pinned
  copies are not "my changes"**, and `isPinnedCopy` is what keeps them out.
- **"Copy from my company"** on the baseline screen reads ONLY the company
  named in server settings (`STARTER_COPY_SOURCE_OWNER_ID`, Q11). It shows
  the same list with tick boxes:
  - hours ticked by default;
  - material prices unticked, ticked one at a time;
  - preview, then Confirm.

  It is an ordinary starter change: new companies get it, existing
  companies get an offer, and the owner's own company is unchanged.

---

## 8. Rule (c) — app releases that change the math

**The rule (owner):** Active, Won, Lost and locked bids never move. A
Draft whose total changes takes the fix and shows **"Total changed because…"**
with the old number. (There is no "Sent" status: `BID_STATUSES` is Draft /
Active / Won / Lost, `drizzle/schema.ts:2069`. Q14 asks whether Active means
"sent".)

### What exists to build on

- **No total is stored anywhere.** Every screen, the proposal included,
  re-prices live through `bidRollup` (`proposalsRouter.ts` 328–367).
- **Past math changes froze a per-LINE flag** where NULL means the old
  meaning (`snapshotLaborOnly`, `snapshotUnpricedParts`) and measured with
  `scripts/bidTotals.mts`. **None of them told Draft apart from Won.**
- **The only lock is `quantitiesLockedAt`**, set by a person, and it freezes
  quantities only (`schema.ts` 2300–2313). Prices are frozen per line anyway.

### The design: a math version per bid

1. **`bids.mathVersion`**, NULL = version 0, the math before this system.
   `shared/mathVersion.ts` holds `CURRENT_MATH_VERSION` and a registry, one
   entry per math change: `{ version, date, reason }`, for example
   `{ 1, "2026-10-12", "Remove and relocate marks now add labor" }`.
2. **Each math change is written as a branch on the bid's version**:
   `atLeast(bid, 1) ? newRule : oldRule`. This is the per-line "NULL = old
   meaning" pattern, lifted to the bid. The old branch stays in the code for
   as long as any bid sits on that version. That is the cost, and it is
   paid on purpose.
3. **New bids start at the current version.**
4. **A release step (Track A, after the deploy):** `scripts/applyMathVersion.mts`.
   For every bid below the current version:
   - **Draft and not locked:** price it at its version and at the current
     one, since both rules are in the code. Set it to current. If the total
     moved, write a `bid_math_changes` row: from, to, total before, total
     after, the registry's reason.
   - **Anything else** (Active, Won, Lost, or locked): leave it alone. It
     prices by its own version from then on.
     It is dry-run first, and prints every moved Draft with old and new
     totals for the owner to read before `--apply`.
5. **The bid screen, Quick bid and the bid list** show a Draft's unread
   math change as a strip: "Total changed from $4,210.00 to $4,465.00
   because remove and relocate marks now add labor. [Got it]". It is never
   shown on the customer's proposal.
6. **`bidTotals.mts` becomes status-aware.** It records status, lock and
   version. In `--compare`, a Draft may move only with a matching
   `bid_math_changes` row, and every other bid must be identical.
7. **A bid moved back to Draft** keeps its version. It gets an "Update to
   the current math" button that shows old → new before applying (Q22).

### Releases this applies to NOW

- **Remove/relocate labor** (`d832e34`, on local-dev, not live) raises
  totals on bids with remove/relocate marks. **Before it goes live it must
  be wrapped as math version 1**, or an Active/Won bid with such marks moves.
  Track A's release plan already counts those bids (handoff "FOR TRACK A").
- **The twin fold** (`b-twin-fold`, queued) lowers totals on purpose. It is
  version 2, or it waits.

---

## 9. AUDIT — what can move a customer's number without them choosing it

Read-only, 2026-10-10. Three searches across `server/`, `shared/` and
`client/src`. The two "bug" claims (F9, F10) were then re-read by hand. **No
frozen snapshot field is ever written by a query, an effect or a startup
pass**; only "Send again", which is a button, re-snapshots. The exposure is
**quantities, which are live on any unlocked bid**, plus settings
inherited live.

### a. Does a bid line freeze everything when it is added?

| Input                                                                       | Frozen?                                                                             | Where                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Material price                                                              | **Frozen** `snapshotMaterialCost`                                                   | `server/db.ts:7340`; run lines :14876                    |
| Hours                                                                       | **Frozen** `snapshotLaborHours`                                                     | :7362, :14919                                            |
| Labor rate                                                                  | **Frozen** `snapshotLaborRate`                                                      | :7367, :14827                                            |
| Modifier %                                                                  | **Frozen** `snapshotModifierPct`                                                    | :7366                                                    |
| Material markup                                                             | **Frozen** `snapshotMarkupPct`; re-apply is a button                                | :7371; `bidsRouter.ts` 1948                              |
| Labor-only                                                                  | **Frozen** `snapshotLaborOnly`                                                      | :7381                                                    |
| Parts list                                                                  | Only its sum is frozen. The not-priced COUNT is live on pre-0087 lines (live has 0) | :7410–7447                                               |
| Unit                                                                        | Not stored; pricing never reads it (cost per unit is frozen)                        | `server/bidPricing.ts:209`                               |
| **Count-linked quantity**                                                   | **Live** count of marks (bid data, not library)                                     | :6947                                                    |
| **Run-type quantities** (pipe, wire, fittings, extras, verticals, homeruns) | **Live, from library values**, until quantities are locked                          | `withTracedFootage` :6599; `fittingRowsByRunType` :14392 |
| **Waste %**                                                                 | **Live**: run → run type → company default → starter once accepted                  | `runTypeFootageCore.ts:372`                              |
| **Overhead / profit / productivity**                                        | **Live** when the bid's own field is NULL — on Won bids too                         | `bidPricing.ts` 69–81                                    |
| **Sales tax**                                                               | **Live** switches and rate, unless overridden on the bid                            | `bidPricing.ts` 91–184                                   |

### b. Does opening, viewing or re-matching a bid change a number?

- **Queries that write:** only settings rows created on first read
  (`getPricingDefaults` `server/db.ts:4931`, branding, proposal settings)
  with the values the read already used, and admin telemetry
  (`pricing_problem_reports`). **No number moves.**
- **Re-match homeruns, Send again, Re-apply markup, symbol linking:** all
  buttons. Send again re-snapshots, and is refused on a locked bid.
- **Viewing the Plans screen DOES write, without a click** (unlocked bids
  only). These are F9–F11 and F17 below.

### Findings — each with a fix, and whether the FIX changes a bid number

| #       | What moves without anyone choosing it                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Fix                                                                                                                                                                                                                                      | Fix moves a number?                                               |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **F1**  | **Run-type quantities on every UNLOCKED bid, Won included, follow library values live**: waste %, raceway stick/strap spacing, bend settings, mounting heights, run-type parts (`server/db.ts` 6599–6737, 14392–14720, 15062–15101). A company editing its own waste % re-counts its old Won bids.                                                                                                                                                                                      | (1) BidRidge changes stop reaching companies (§ 2, § 6). (2) **Lock quantities automatically when a bid leaves Draft** (Q15), with Unlock one click away as today. (3) Library edit forms say "N draft bids use this and will re-count". | **No**: it freezes. Locking a Won bid freezes it where it stands. |
| **F2**  | **Boot pass 1 re-stamps shared materials every start**: price, labor hours, raceway facts, example flags (`server/db.ts` 2384–2451). Unforked companies' items change on deploy, and changed raceway facts move fitting counts on open bids.                                                                                                                                                                                                                                            | § 6: the seed proposes, the owner confirms, and changes go through pin-then-offer.                                                                                                                                                       | No                                                                |
| **F3**  | **Boot pass 2 writes companies' OWN copies**: fills NULL `stickLengthFeet`, `strapSpacingFeet`, `strapFromBoxFeet`, `stickJoint`, `defaultQty`, category, aliases (`server/db.ts` 2453–2517). A coupling or strap count can go from "not countable" to a number on an open bid.                                                                                                                                                                                                         | Stop filling number fields on company rows; offer them instead. Category and aliases may stay (finding fields).                                                                                                                          | No                                                                |
| **F4**  | **`seedBaselineRunTypes` fills and re-points shipped run types' parts** (`swapBaselineRunTypeMaterials` `server/db.ts:2870`), adds extras (~2954) and archives types (~2907). Fitting counts on open bids follow the new raceway's facts.                                                                                                                                                                                                                                               | Pin, then offer (§ 2), like any run-type change.                                                                                                                                                                                         | No                                                                |
| **F5**  | **`backfillLaborRateAmounts` re-stamps shipped labor rates** (`server/db.ts:3040`). Existing lines keep their frozen rate, but an unforked company's NEXT line uses the new rate, and the "stale rate" warning appears unasked.                                                                                                                                                                                                                                                         | Pin, then offer.                                                                                                                                                                                                                         | No                                                                |
| **F6**  | **`seedBaselineAssemblies` writes shipped assemblies** (`laborRateId`, `laborOnly`, `mountHeightTypeKey` where NULL, hours, cleared hours, `server/db.ts` 4229–4249, 4565+). New lines change, and `mountHeightTypeKey` is read LIVE by drops and verticals, so draft vertical footage moves.                                                                                                                                                                                           | Pin, then offer.                                                                                                                                                                                                                         | No                                                                |
| **F7**  | **Shipped defaults held in CODE are read live**: `SHIPPED_HEIGHT_TYPES` (`shared/takeoffHeights.ts:145`) and bend defaults where the company row is NULL (`takeoff_bend_defaults`, `schema.ts` ~3438). A release that changes one moves verticals and fittings on unlocked bids.                                                                                                                                                                                                        | Owner rework item 4 makes these OFFERS, so they become starter DATA (shared rows a company is pinned to, § 2) instead of code constants. Until then, a release that changes one counts as a math change (§ 8).                           | No                                                                |
| **F8**  | **Overhead, profit, productivity and tax are inherited live on every bid, Won included** (`bidPricing.ts` 69–184). This is a standing decision (CLAUDE.md § "Settings are inherited, not copied"), but it means a company changing its own margin re-prices its Won bids.                                                                                                                                                                                                               | **Owner decides (Q16).** Suggested: when a bid leaves Draft, write the values in effect onto the bid as its own settings, so drafts still follow the company and sent bids stop.                                                         | No (it writes what is in effect)                                  |
| **F9**  | **"Remove scale" is undone by looking.** `clearSheetScale` sets `scaleSource = "none"` (`bidPdfsRouter.ts` ~966). The next time the sheet is shown, detection runs on its own (`TakeoffPage.tsx` ~8866) and re-applies a high-confidence reading (`bidPdfsRouter.ts` ~1018), so traced footage jumps from 0 back to feet. Confirmed by reading; not yet reproduced.                                                                                                                     | A cleared scale is remembered: `scaleSource` gains `cleared`, which detection treats like `manual`. One enum value (BS-M8).                                                                                                              | No                                                                |
| **F10** | **A hand-placed panel can re-match homeruns on a LATER sheet.** `placePanelSpot` arms `rematchOnNextSync` (`TakeoffPage.tsx:4744`), but the sync signature leaves out the panel spot (`client/src/lib/homerunSync.ts` ~47). If the circuits did not change, no sync fires and the flag stays armed, so the next sync — just opening another sheet — goes out with `rematch: true` and re-points that sheet's unconfirmed homeruns. **Plausible from reading; reproduce before fixing.** | Arm the flag per SHEET and clear it when that sheet's placement settles; or put the spot in the signature. Add a test in `client/src/lib`.                                                                                               | No                                                                |
| **F11** | **Opening a sheet creates homerun circuits it has not seen** (`TakeoffPage.tsx` ~4889, `syncHomeruns`), which adds homerun feet to an unlocked bid. This is by design ("a visit only CREATES circuits"), but it is a number moving because someone looked.                                                                                                                                                                                                                              | Owner decides (Q19). Suggested: keep it on Draft only; with F1's auto-lock, sent bids are covered.                                                                                                                                       | No                                                                |
| **F12** | **A run type re-pointed to a new part** prices the new part's quantity at the OLD part's frozen price until "Send again" (`takeoffRunTypesRouter.ts` 1176–1204).                                                                                                                                                                                                                                                                                                                        | The line shows "Part changed — Send again" as its fix-it, and the bid's warning strip counts it.                                                                                                                                         | No by itself; pressing Send again does, by choice                 |
| **F13** | **The drops-not-priced warning ignores the lock** (`bidDropsNotPriced` `server/db.ts` 15199–15212) and reads the assembly's mount type live, so a locked bid's "N drops not priced" can change.                                                                                                                                                                                                                                                                                         | Honour `quantitiesLockedAt` there like everywhere else.                                                                                                                                                                                  | Count only, no dollars                                            |
| **F14** | **Pre-0087 lines count not-priced parts from the recipe live** (known; live had 0 on 2026-10-07).                                                                                                                                                                                                                                                                                                                                                                                       | The planned one-time freeze (`todo.md`, "WRONG-NUMBER RISK"). Recount before every release.                                                                                                                                              | No                                                                |
| **F15** | **Scale detection on the first view of an unscaled sheet applies a high-confidence scale**, so footage appears without a click (`bidPdfsRouter.ts` ~1018). A convenience by design.                                                                                                                                                                                                                                                                                                     | Owner decides (Q19, with F11). Suggested: keep it, but say so on the sheet: "Scale read from the drawing: 1/8" = 1'. Change".                                                                                                            | No                                                                |
| **F16** | **Crash recovery re-sends queued marks on load** (`TakeoffPage.tsx` ~7147). These are the user's own clicks, but counts change on open with nothing said.                                                                                                                                                                                                                                                                                                                               | A toast: "3 marks from your last session were saved".                                                                                                                                                                                    | No                                                                |
| **F17** | **No bid status freezes anything**, and there is no "Sent" status or sent-total record.                                                                                                                                                                                                                                                                                                                                                                                                 | § 8 (math version) + F1 (auto-lock) + F8 (settings) together make "sent" mean something. Q14 names which status is "sent".                                                                                                               | No                                                                |

**The short version:** money on a line is safe. Quantities on unlocked bids,
inherited settings, and the boot's writes to the starter are not. **F1, F2
and F8 are the ones that matter most**, because they can move a Won bid's
total silently.

---

## 10. Migrations — drafts for Track A, unnumbered

The latest file on disk is `0143`; A assigns numbers. **All additive (step 1)**, safe before the code. **Step 3 is empty**: no backfill. In particular,
pins are made when a starter change happens, never by a migration.

| Draft     | What                                                                                                                                                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **BS-M1** | `users.role` gains `starter_editor` (enum value appended)                                                                                                                                                                                                               |
| **BS-M2** | `starter_editor_factors` (encrypted secret, last step, failed attempts, locked until) and `starter_editor_recovery_codes` (hashed)                                                                                                                                      |
| **BS-M3** | `starter_change_batches` (editor, source enum `screen,sheet,copy,seed,undo`, file name, SHA-256, count, createdAt) and `starter_changes` (batch, `kind` enum `change,add,hide,unhide`, table, row id, field, old value, new value, version, note, undone-by)            |
| **BS-M4** | `starter_change_pins` (change id, company owner id, fork id) — which copies a change created                                                                                                                                                                            |
| **BS-M5** | `isPinnedCopy BOOLEAN NULL` on `materials`, `assemblies`, `labor_rates`, `modifiers`, `takeoff_run_types`, `kits`, `labor_steps` (NULL = a company's own copy, today's meaning); and `hiddenAt TIMESTAMP NULL`, `replacedById INT NULL` on the same tables' shared rows |
| **BS-M6** | `companies.starterSeenAt TIMESTAMP NULL` (NULL = the company's creation date) and `starter_offer_answers` (company owner id, change id, answer enum `accepted,ignored`, answeredAt)                                                                                     |
| **BS-M7** | `bids.mathVersion INT NULL` (NULL = version 0) and `bid_math_changes` (bid id, from, to, total before, total after, reason, createdAt, seenAt)                                                                                                                          |
| **BS-M8** | `bid_pdf_sheets.scaleSource` gains `cleared` (F9; enum value appended)                                                                                                                                                                                                  |

SQL drafts for BS-M1 to BS-M3 are in the first version of this file
(`eddc870`, § 7). They are unchanged except that BS-M3 gains `kind` and
`version`, and the old `forksUpdated` / `forksLeft` columns become
`starter_change_pins`. **Hand-write every one** (CLAUDE.md: `drizzle-kit
generate` re-emits hand-written migrations). Full SQL for BS-M4 to BS-M8 is
written when a piece is scheduled, from this table, so it is not drafted
twice.

```sql
-- BS-M5, the pattern, materials shown; same three columns on each listed table.
ALTER TABLE `materials` ADD `isPinnedCopy` boolean NULL;
ALTER TABLE `materials` ADD `hiddenAt` timestamp NULL;
ALTER TABLE `materials` ADD `replacedById` int NULL;
-- BS-M7
ALTER TABLE `bids` ADD `mathVersion` int NULL;
CREATE TABLE `bid_math_changes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`bidId` int NOT NULL,
	`fromVersion` int NULL,
	`toVersion` int NOT NULL,
	`totalBefore` decimal(14,4) NOT NULL,
	`totalAfter` decimal(14,4) NOT NULL,
	`reason` varchar(512) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`seenAt` timestamp NULL,
	CONSTRAINT `bid_math_changes_id` PRIMARY KEY(`id`),
	CONSTRAINT `bid_math_changes_bidId_bids_id_fk` FOREIGN KEY (`bidId`) REFERENCES `bids`(`id`) ON DELETE cascade ON UPDATE no action
) COLLATE=utf8mb4_unicode_ci;
CREATE INDEX `bid_math_changes_bidId_idx` ON `bid_math_changes` (`bidId`);
-- BS-M8
ALTER TABLE `bid_pdf_sheets` MODIFY COLUMN `scaleSource`
  enum('detected','manual','none','cleared') NOT NULL DEFAULT 'none';
```

---

## 11. Who builds what (owner Q12) and in what order

**A: login + startup change. C: number rules + tests. B: screen.**

| Track | Builds                                                                                                                                                                                                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A** | BS-M1–M8; the `starter_editor` account, authenticator step and short sessions; the boot change (§ 6, F2–F6); `applyMathVersion.mts` and the release step (§ 8); the CLAUDE.md amendments                                                   |
| **C** | `applyStarterChange` (pin, change, log), offers and accept, undo, hide-with-replacement, the unit refusal, the shared sheet checks, export and drift, `shared/mathVersion.ts` and the bid-version branching, F9, F10, F12, F13; every test |
| **B** | The baseline screen; the Updates tabs and "N starter updates available"; the "New" badge; "My changes"; the "Total changed because…" strip; F16's toast                                                                                    |

**Order:**

1. **§ 8 math version + F1 auto-lock (if Q15 is yes), BEFORE remove/relocate
   labor goes live.** They protect bids that exist today, so they come first.
2. F9 and F10, small and independent.
3. Pinning + the boot change (F2–F6). After this, a deploy can no longer
   reach a company's library.
4. The master account and the screen, with single edits, the log and undo.
5. Offers and the Updates tabs.
6. Hide and add.
7. Sheet upload. "Copy from my company" last.

**Proof per release:** `bidTotals.mts` (status-aware, § 8) before and after.
Only Drafts with a `bid_math_changes` row may move.

---

## 12. Owner answers (2026-10-10) and the questions still open

### Answered

| Q   | Answer                                                                                   |
| --- | ---------------------------------------------------------------------------------------- |
| 1   | Authenticator app, not email                                                             |
| 2   | QR code setup                                                                            |
| 3   | The browser reads the sheet; the server re-checks every row                              |
| 4   | Any bad row stops the whole upload, with every bad row listed                            |
| 5   | **Superseded** by § 0: never auto-update; offer instead                                  |
| 6   | Undo the rest, and list the ones edited since                                            |
| 7   | **Superseded** by § 0: offer, never automatic                                            |
| 8   | Labor rates and step minutes later; prices and hours first                               |
| 9   | "My changes" is a tab on Materials and a tab on Assemblies                               |
| 10  | Not this version, but leave room to add your own custom items to the starter later (§ 3) |
| 11  | Copy reads only your company, set in server settings                                     |
| 12  | A: login + startup change. C: number rules + tests. B: the screen                        |
| 13  | No "re-price this bid" button for now                                                    |

### Open — each with a suggested answer

| Q   | Question                                                                                                   | Suggested                                                                                                                  | Moves a bid number?                                 |
| --- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 14  | There is no "Sent" status. Which statuses must never move: Active, Won, Lost, and locked?                  | **Active, Won, Lost and any locked bid.** Only Draft takes math fixes.                                                     | **Yes**: it decides which bids take a math fix      |
| 15  | Lock quantities automatically when a bid leaves Draft?                                                     | **Yes**, with Unlock one click away. Otherwise a Won bid's pipe and wire keep following library edits (F1).                | No: it stops future moves                           |
| 16  | Freeze overhead, profit, productivity and tax onto a bid when it leaves Draft?                             | **Yes**: write the values in effect onto the bid. Drafts still follow the company. (Changes CLAUDE.md § Company defaults.) | No on the day; afterwards, sent bids stop following |
| 17  | Starter NAME changes: offer, or reach everyone?                                                            | **Offer.** It is what a company sees on its screens.                                                                       | No                                                  |
| 18  | "Accept all": include items you changed yourself?                                                          | **No.** Those are listed apart, one at a time, showing yours vs BidRidge's new value.                                      | No                                                  |
| 19  | Viewing a sheet creates homerun circuits (F11) and applies a read scale (F15). Keep, or make them buttons? | **Keep on Drafts only**, and say so on screen. With Q15, sent bids are covered.                                            | **Yes**, on drafts, when the plans are viewed       |
| 20  | Pinning cost (§ 2): fine until about 1,000 companies, then a rewrite. Accept for now?                      | **Yes.** Measure the row count at each release.                                                                            | No                                                  |
| 21  | Search words, category shelf, description and sort order: reach everyone as app improvements?              | **Yes.** They change no number and no item.                                                                                | No                                                  |
| 22  | A bid moved back to Draft keeps its old math. Offer "Update to the current math" with old → new shown?     | **Yes**, as a button. Never automatic.                                                                                     | **Yes**, if pressed                                 |
