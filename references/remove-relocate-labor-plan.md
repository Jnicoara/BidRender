# Remove and relocate labor — PLAN ONLY, 2026-10-05

**Status: nothing built.** No migration written, no code changed. The owner's
decision is `owner-questions.md` § 2; this file says what it needs.

## The decision (owner, 2026-10-05)

- A count with REMOVE or RELOCATE marks puts **one labor line per kind** on
  the bid: "Remove duplex receptacle × 4", "Relocate duplex receptacle × 2".
- **The hours live on the ASSEMBLY** — remove hours and relocate hours, set
  once, reused on every job — **with a per-bid override.**
- **Unset hours show "not priced"**, never a silent $0, and the line counts
  as unfinished at bid time.
- **Relocate is labor only.** New wire or boxes are counted as normal new
  work.

Earlier records this agrees with or touches:

- `track-b-count-pin-styles-plan.md` § 4 and `shared/markStatus.ts`: only a
  NEW mark is a quantity of parts. Unchanged — these lines carry no material.
- `todo.md` "Owner: what do REMOVE and RELOCATE cost?" — answered by this.
- `starter-assemblies-plan.md` DR19 "Relocate receptacle (wall move), MC" is
  an assembly WITH materials. It stays: it is a count of the new work a move
  needs, which is exactly "new wire or boxes are counted as normal new work".
  The relocate MARK's line is the labor of moving the device itself.
- CLAUDE.md § "Starter content ships unpriced": the shipped starter
  assemblies get NULL remove/relocate hours, so a new account sees "not
  priced" until it sets them.

## What it needs

### Drops — matches Track B's code, nothing to build

Track B's vertical-drops plan § 10.4 (answer d) parked relocate drops "until
remove/relocate labor pricing is decided". Question 2 decides it: relocate is
labor only, and new wire or boxes are counted as normal new work. So a remove
or relocate mark gets **no count drop**, which is what the code already does
(`markIsQuantity` in `server/db.ts`, read by the drops). Recorded in both
files on 2026-10-06. A run that ENDS on such a device follows option C
(owner-questions § 3, built by B in `faeaab8`): its drop prices, says so,
and has "Leave it off".

### Columns — Batch 2, three additive files (none written)

**Numbers from `migrations-next-batch.md` (on `a-migrations-plan`,
2026-10-06), the one list of every track's asks.** These columns share files
with other tracks' columns on the same tables (one `ALTER` per table):
0109 also carries B's `mountHeightTypeKey` and `materialByQuote`; 0114
also carries B's six quote-item columns. (This said 0108–0110 the day
before; that numbering split `assemblies` and `bid_line_items` across
several `ALTER`s.)

| #    | Table            | Adds                                                                                           | Why                                                                         |
| ---- | ---------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 0109 | `assemblies`     | `removeLaborHours`, `relocateLaborHours` decimal(10,4) **NULL**, no default                    | Set once, every job. NULL = not set → "not priced". 0 is a real answer.     |
| 0110 | `takeoff_groups` | `removeLaborHours`, `relocateLaborHours` decimal(10,4) **NULL**, no default                    | The per-bid override: a count is one assembly on one bid. NULL = follow it. |
| 0114 | `bid_line_items` | `lineRole` enum('install','remove','relocate') **NOT NULL DEFAULT 'install'**; unique key swap | One count can now own up to three lines.                                    |

**0114 is the one to read twice.** A count's line is held unique by
`bid_line_items_bid_group_uq (bidId, takeoffGroupId)` (0060). A count with
remove marks needs a second line, so the key becomes `(bidId,
takeoffGroupId, lineRole)`. `lineRole` is NOT NULL on purpose: MySQL treats
NULLs in a unique key as all different, so a nullable role would silently
stop guarding the ordinary one-line-per-count rule. The default is safe
because every existing line IS an install line. That is its meaning, not a
placeholder, so no number moves and "not yet migrated" never needs telling
apart. Order inside 0114: add the column, ADD the new unique key, then DROP
the old one. Old code never writes a role, so for old code the new key is
exactly as strict as the old. The rehearsal must confirm the foreign key on
`bidId` is still backed by an index after the drop. The new key starts with
`bidId`, so it should be.

All three are step 1 (additive). There is no backfill, so **step 3 is
empty**.

### Code (after the columns are on staging)

1. **Assembly editor:** two optional hour fields, "Remove (hrs each)" and
   "Relocate (hrs each)", behind the editor's existing "more" fold
   (CLAUDE.md § Customization: common few visible). `InlineNumberField` with
   `whenUnset={{ placeholder: "not set" }}`, never `?? 0` (§ Editing fields 6).
2. **Count card:** where it says "N remove/relocate — labor not on the bid"
   today, show each kind's hours: from the assembly, or this bid's override,
   with the inheritance worded per `HeightFields` (`unsetLabel` /
   `setLabel`): "the assembly's 0.25 h" vs "not set".
3. **Send:** `sendToBid` / Send all create the install line as today, plus a
   remove and/or relocate line when the count has such marks. Each has
   `lineRole`, no material, `snapshotLaborHours` = override ?? assembly ??
   NULL, and the labor rate from the assembly's role. Quantity is derived live
   from the marks with that status, like the install line from new marks
   (`shared/takeoffBridge.ts`).
4. **Not priced:** a remove/relocate line with NULL hours is "not priced" in
   `shared/lineNotPriced.ts`, shows "Not priced" in `LineCost`, and is counted
   in the total's "N lines not priced" and the bid-time unfinished check. Its
   hours can be typed on the line, as on a free count (`handPricedLines`).
5. **Snapshot rule unchanged:** once a line exists, a later change to the
   assembly's or the count's hours does not move it. The card says so when
   they differ; removing the line and sending again picks up the new hours.
6. **Plain counts** (no assembly) have no assembly hours: their
   remove/relocate lines arrive "not priced" with hours typed on the line,
   which is the free-count path.

### Tests that must go red without the change

- A count with 3 new, 2 remove, 1 relocate sends three lines; quantities 3/2/1.
- Assembly hours used; the count's override wins; both NULL → "not priced"
  and counted as unfinished.
- Changing assembly hours after send does not move the line (snapshot).
- The unique key: a second install line for the same count is still refused.
- `bidTotals.mts` before/after on the migrated copy: no existing total moves.
