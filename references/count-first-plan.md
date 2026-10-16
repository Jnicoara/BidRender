# Count first, pick the item later — plan (Track B, 2026-10-15 night)

> **BUILT the same night** on track-b (`745da6da` server, then the screens).
> As built, beyond the text below: typing "Unassigned" as a count's name is
> refused too (two rows reading "Unassigned" would look alike); "Add a drop"
> is not offered on the Unassigned row (a drop is a fact about what a device
> is); assigning reuses `takeoffStamps.moveToGroup` with a new `fromGroupId`,
> so it has Undo like "Move to"; the pin is "?" in a circle in an ordinary
> palette colour (the palette is closed — the CSV relies on it).

Owner, 2026-10-15: _"Just count, pick the item later": a count with no item
yet shows as "Unassigned" and blocks a priced print until assigned (like "not
priced"). Plan first, then build. Park anything that changes a total._

## 0. What is already decided — read before this

- **`plan-viewer-overhaul.md` § 16, "Mark first, name it after"** (planned
  2026-09-21, never built) is this feature. This plan builds its steps 3–5
  and answers its § 16.5 questions (§ 2 below). Its steps 1–2 (materials as
  a count's item) and the selection half of step 4 have since shipped:
  marks can be selected and moved ("Move to", `takeoffStamps.moveToGroup`).
- **§ 5f.4 (owner, 2026-09-25): a NAMED count with no item reaches the bid**
  as a line priced by hand. That stays. A named count is not missing
  anything — it is level 1, and CLAUDE.md § "As manual or as automated as the
  user wants" forbids treating it as lesser. So "Unassigned" here means a
  count with **no item and no name**, never a level-1 count. (Q1 asks.)
- **Drops not priced (owner, 2026-10-07)** already block a priced print from
  the Plans side; this follows that precedent for the print.

## 1. What it does

1. **Count without naming anything.** The Count picker gets a first row,
   "Just count — pick what it is later" (and Enter on an empty box picks it).
   Every tap drops a mark into the bid's **Unassigned** count.
2. **It reads as unassigned everywhere it shows.** Counted-items panel: an
   amber "Unassigned" row, listed first, "N marks — pick what they are".
   On the drawing: a grey pin with a "?" in it. Never shown under its stored
   label.
3. **Assigning.** On the Unassigned row, "Pick what they are…" opens the
   same Count picker; the choice (an assembly, a material, or a typed name)
   becomes a count the ordinary way, and every unassigned mark moves into it
   (`moveToGroup`). For SOME of them: select those marks and "Move to", as
   today.
4. **It never goes to the bid.** The Unassigned count is not sendable
   ("Pick what these marks are first"), so "Send all" skips it.
5. **It blocks a priced print**, like a line not priced: the proposal's
   Print says "N marks on the Plans screen are unassigned — pick what they
   are", with no way past. Scope-only prints are never blocked.

## 2. Decisions taken (B, overnight) — § 16.5's two questions

- **One Unassigned count per BID, not per sheet.** Counts are per bid
  already; the panel shows a sheet's own marks, so it still reads "3 on this
  sheet", and one "Pick what they are…" assigns a whole bid's worth.
- **A reserved label, not a new column — and nobody can type it.** The
  count is an ordinary `kind: "plain"` group labelled `__unassigned__`;
  every typed label is refused if it starts with `__`, so an estimator's own
  count can never fall into it (§ 16.5's worry). No migration. A flag column
  stays possible later if it is ever wanted.

## 3. What it does NOT change (so nothing here moves a total)

- No bid line is created, priced or removed by any of this; the money on a
  bid is the same before and after.
- **The bid total's wording is left alone** — the block is on the PRINT,
  and the bid page says so in its warning strip, not in the total (Q2).
- Moving marks out of Unassigned into an existing count that IS on the bid
  raises that line's quantity, exactly as "Move to" does today. That is the
  estimator's act, not this feature's.

## 4. Build order (each its own commit, with a test that fails without it)

1. Shared: `UNASSIGNED_COUNT_LABEL`, `isUnassignedCount`, the label guard,
   `sendability` → "unassigned". (`shared/` + router; pure tests.)
2. Server: `takeoffGroups.create({ unassigned: true })` finds or makes the
   bid's one Unassigned count. Proposal + bid loaders return
   `unassignedMarks`.
3. Screens: the picker row, the panel row + "Pick what they are…", the "?"
   pin, the print block, the bid warning. Looked at laptop, iPad, phone.

## 5. Questions for the owner (numbered; none blocks the build)

- **Q1.** Should a NAMED count with no item (level 1) ALSO read
  "Unassigned" and block the print? — Suggested **no**: it is priced by
  hand on the bid today (§ 5f.4) and its unpriced line already blocks the
  print as "not priced". Making it Unassigned would block a hand-priced
  line that is complete.
- **Q2. ANSWERED YES (owner, 2026-10-15) — built: the whole-bid totals say it, a label only.** Should the bid TOTAL also say "+ N marks unassigned", like
  "+ 2 drops not priced"? — Parked (changes what a total says). Built
  without it: the print block and a warning strip line.
- **Q3.** Should the Unassigned count ever reach the bid as an unpriced
  line instead? — Suggested **no**: a line called "Unassigned" on a bid is
  a line nobody can price.
