# Track B: delete rules, whole-set summary, Send all, audit, panning

**PLANNED 2026-09-29 on `track-b`. PLAN ONLY — nothing in this file is built.**
Part 1 of the same brief (a locked bid refuses every change to its plans, and
the emptied count card keeps its Undo) IS built, in the commit beside this file.

**How this was gathered.** File:line references were read on `87b29e8` plus the
Part 1 change. Sections 1, 4, 5 and 6 are **code reads**. The only things looked
at on a running screen were the Part 1 checks. Where a claim needs a
measurement, the measurement is the first step of that piece.

**No part of this plan needs a migration.** Nothing goes to Track A (§ 7).

---

## Decisions this plan touches — read before approving

| Earlier decision                                                                                                                                                         | What this plan does                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plan-viewer-overhaul.md` **OVERRIDE 3** (the lock), and `takeoffStampsRouter.ts`: "placing a mark stays allowed on purpose"                                             | **Overridden by Part 1, built today** (owner: "a locked bid must not change"). A locked bid now refuses new marks, runs, legs, typed lengths, pull points and circuits. OVERRIDE 3 carries a line saying so. |
| `server/quantityLock.test.ts` "a count sent to a locked bid": **Send is NOT refused on a locked bid**, "a second lock rule in a second place"                            | **§ 3 asks for "Send all" to be refused on a locked bid**, which contradicts this for bulk only. Not decided: see Question 1.                                                                                |
| `plan-viewer-overhaul.md` § "decide per VIEW, not per axis" (~line 2146): "If the whole sheet fits, centre both — deliberate and stays"                                  | **§ 6 proposes overriding it** so a zoomed-out sheet can be moved a little. Both files get a line when built.                                                                                                |
| `plan-viewer-overhaul.md` **§ 5f.0 OVERRIDE 2**: the first crossing to the bid is an explicit act; "not on the bid yet" is a line of words, never a badge on the drawing | **Agrees.** § 2 and § 3 keep both: the summary is words in a panel, and Send all is a preview plus one confirm.                                                                                              |
| `takeoff-spec.md` § 8 item 7 / line 1232: "Stamp counts are never totalled across the whole bid on this screen"                                                          | **Already stale.** `takeoffGroups.list` is whole-bid today and the panel's "N counts are not on the bid yet" reads it. § 2 builds on that. The line gets corrected when § 2 is built.                        |
| `takeoff-spec.md` **D6** undo, and `track-b-plans-screen-edits-plan.md` Part 3                                                                                           | **Agrees**, and § 1 extends it: a single-mark or single-count delete gets an Undo _button in its toast_, not just "Ctrl+Z puts it back".                                                                     |

---

## 1. Delete rules that scale with what is lost

### 1.1 The rule — one look everywhere

| What is lost                                                  | Confirm?                                                                                                                                                                             | After                                                   |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **One mark**, or **one count's marks** on this sheet          | **No box.**                                                                                                                                                                          | A toast with an **Undo button**, plus the card's arrow. |
| **A whole count card** (every mark, every sheet) or **a run** | **A confirm that names what is lost**: "Delete run R3, 84 ft, 2 drops?" The red button says **"Delete run"** (never "Yes"). Default focus on **Cancel**. **Enter does not confirm.** | Toast with Undo.                                        |
| **Clear sheet**                                               | **Strongest confirm, showing the totals lost**: "Remove 6 runs (412 ft) and 38 marks in 5 counts from E1.2?" plus a line for any count that drops to 0.                              | Toast with Undo (exists).                               |
| **Anything on a locked bid**                                  | **Refused outright**, with the lock sentence. No confirm is offered for something that will be refused.                                                                              | —                                                       |

**One component.** Every confirm above is one `DeleteConfirm` (Radix
AlertDialog), taking `{ title, lines, actionLabel }`. Radix already focuses
Cancel on open (`@radix-ui/react-alert-dialog`, no override in
`components/ui/alert-dialog.tsx`). **"Enter does not confirm" needs care,**
though. With Cancel focused, Enter presses _Cancel_, which is the behaviour
we want, but that only holds while focus stays there. The component should
also swallow Enter on the action button (`onKeyDown` → `preventDefault` for
Enter), so a Tab-then-Enter habit cannot delete. Space and a click still
confirm.

**One toast.** `toast(label, { action: { label: "Undo", onClick: stepBack } })`,
the way the Dashboard's archive toast already does it (`DashboardPage.tsx:254`).
Every Plans-screen delete says the same shape of sentence: "Deleted 1 mark",
"Deleted run R3 (84 ft)".

### 1.2 Every place that deletes today, and what it does

Locked means `bids.quantitiesLockedAt` is set. "Stack" means the Plans
screen's undo stack (toolbar Undo, Ctrl+Z).

| #   | What                            | Control today                                                                           | Confirm today                                                               | After today                                                                     | Locked today                                                 | Change under § 1.1                                                                                                          |
| --- | ------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| a   | One mark                        | Card trash (1-mark count), toolbar Delete, Delete/Backspace, "Delete" pill on the sheet | None                                                                        | Toast "Deleted 1 mark. Ctrl+Z puts it back." (text only). On the stack.         | Server refuses; the key handler has no client check          | **Undo button in the toast.** Client-side lock check on the key.                                                            |
| b   | Several marks (a selection)     | Same controls                                                                           | "Delete N marks?" · **Keep them** / **Delete N marks**                      | Same toast                                                                      | Server refuses; toolbar button disabled                      | Keep the confirm when the selection spans **more than one count**; one count's marks follow row a.                          |
| c   | A count's marks on this sheet   | Card trash, "…the count stays"                                                          | Only when more than one mark                                                | Toast; the card's arrow. **Since Part 1 the arrow survives the card emptying.** | Button disabled                                              | **No confirm** (it is one count, and one undo). Undo in the toast.                                                          |
| c′  | A whole count card, every sheet | `takeoffGroups.remove` exists; **no control calls it**                                  | —                                                                           | —                                                                               | **No lock check**; refused only when the count is on the bid | New control: confirm "Delete count Exit sign — 14 marks on 3 sheets?" · **Delete count**. Add lock check.                   |
| d   | A run, or one leg               | Run card trash, toolbar "Delete run/leg", Delete key                                    | **None**                                                                    | **No toast at all.** On the stack.                                              | Server refuses; key skips; **card trash not disabled**       | **Confirm for a whole run** ("Delete run R3, 84 ft, 2 drops?"). A single leg: no confirm, toast. Disable trash when locked. |
| e   | A run point                     | Right-click a handle, or select it and press Delete                                     | None                                                                        | On the stack                                                                    | Editing is off; server refuses                               | No change (it is an edit, undoable in one step).                                                                            |
| f   | A circuit                       | Trash "Remove {name}"                                                                   | None                                                                        | **No toast, no undo**                                                           | **Refused since Part 1**                                     | Toast with Undo (needs a restore packet, § 1.4).                                                                            |
| g   | A pull-point answer             | "Undo" beside the answer                                                                | None                                                                        | The spot is proposed again                                                      | **Refused since Part 1**                                     | Rename the button "Take back" (a third thing called Undo, audit #26).                                                       |
| h   | A run type                      | `takeoffRunTypes.archive` exists; no control calls it                                   | —                                                                           | —                                                                               | —                                                            | Out of scope.                                                                                                               |
| i   | Clear this sheet                | Sheet "…" menu                                                                          | "Clear {sheet}?" · counts · **Keep them** / **Remove N items**              | Toast "…Ctrl+Z puts them back." On the stack.                                   | Refused; menu item says "unlock the bid first"               | Add **feet** of run lost to the body. Undo button in the toast.                                                             |
| j   | A sheet's scale                 | "Clear" in the scale popover                                                            | **None**                                                                    | **No toast, no undo**                                                           | **Not refused**                                              | See Question 3. Clearing a scale drops every measured run on the sheet out of the totals.                                   |
| k   | A plan set                      | Row trash "Remove {filename}"                                                           | Yes, lists every mark, run and circuit lost · **Keep it** / **Remove plan** | Toast; **no undo**                                                              | **Not refused**, and it cascades away the marks and runs     | **Refuse on a locked bid** (wrong-number risk, § 7).                                                                        |
| l   | A legend symbol                 | Hover-only trash                                                                        | None                                                                        | No toast, no undo                                                               | n/a                                                          | Confirm: it also drops learned corrections.                                                                                 |
| m   | A bid line                      | Hover-only X on the bid                                                                 | None                                                                        | Error toast only                                                                | **Not refused**                                              | Toast with Undo. Whether a locked bid refuses it is Question 4.                                                             |
| n   | Archive a bid                   | Archive dialog                                                                          | **Keep it** / **Archive bid**                                               | Toast with a real **Undo** button                                               | n/a                                                          | Already the model for § 1.1.                                                                                                |
| o   | Delete a bid for good           | Archive page                                                                            | **Keep it** / **Delete permanently**                                        | Toast                                                                           | n/a                                                          | No change.                                                                                                                  |

### 1.3 Does Undo fully restore a deleted run?

**Yes, for everything that belongs to the run.** The delete snapshots the
whole network: the root, every leg, tees, circuits and pull-point answers
(`server/takeoffRestore.ts`). The undo re-inserts them with the **same ids**.
Ends and heights, extras and makeup, typed length, trace mode, the run-type
link and label, and the end-mark links all come back, because they are columns
on those rows.

**It refuses rather than restoring part of a run** when:

- a mark the run ended on has been deleted since;
- its run type is gone;
- anything in the network changed after the delete.

Bid lines are not touched: they point at the run TYPE, so their quantity just
re-derives. Only screen state (the selection) is not restored.

### 1.4 Does Undo survive leaving the page?

**No.** The stack is React state inside `TakeoffPage` (`undoStack.ts:23`, max
50 steps).

| Leaving how                              | Undo history                 |
| ---------------------------------------- | ---------------------------- |
| Another sheet or plan on the same bid    | **Kept**                     |
| Another screen (bid, dashboard) and back | **Lost** — the page unmounts |
| Reload, or another tab                   | **Lost**                     |

The toolbar then says "Nothing to undo on this bid yet", which is true but does
not say the history was dropped. **Recommendation:** keep the stack per bid in
`sessionStorage`. The packets are signed and self-contained, so an old one is
either still valid or refused with its own sentence. That makes it survive a
screen change and a reload in the same tab. Across tabs stays out of scope.

---

## 2. Whole-plan-set summary

**What exists.** Counts are already whole-bid (`takeoffGroups.list`: count,
`sendability`, `waitingToSend`). Run footage is whole-bid
(`takeoffRuns.totals`, with `leftOut`). The per-type bridge is whole-bid
(`takeoffRunTypes.bridgeForBid`). The takeoff export already partitions per
sheet with a "Not included" list (`stage-5-track-b-plan.md`). **So this is one
new query that composes existing pieces, not new arithmetic.** That matters:
a second computation of the same totals is the disagreement CLAUDE.md warns
about.

**The query: `takeoffSummary.forBid({ bidId })`.**

```
onBid:     [{ kind: "count"|"runType", name, qty, unit, sheets: [ids] }]
notOnBid:  [{ kind, name, qty|null, unit, reason, sheets, fix }]
totals:    { counts: {onBid, notOnBid}, feet: {onBid, notOnBid} }
```

**Every reason an item is not on the bid**, each with a sentence and a fix:

| Reason         | Sentence                                                            | Fix offered                |
| -------------- | ------------------------------------------------------------------- | -------------------------- |
| `notSent`      | "Counted, not sent yet."                                            | Send (single, or Send all) |
| `noType`       | "Traced with no run type, so nothing says what it is."              | Jump to the run            |
| `noScale`      | "On a sheet with no scale, so it has no length." (lists the sheets) | Jump to the sheet's scale  |
| `noMaterial`   | "Its run type does not say what it is made of."                     | Open the type              |
| `untypedPrice` | "Carries its own typed price, which cannot reach the bid yet."      | —                          |
| `assemblyGone` | "Counted against an assembly no longer in your library."            | —                          |
| `locked`       | "The bid is locked. Unlock it to add this."                         | Go to the bid              |
| `suggestion`   | "An AI suggestion nobody has accepted." (only if the reader is on)  | Jump to it                 |

**Not reasons**, deliberately, and the summary says so in its footnote.
Drafts count on the bid (owner, 2026-09-27, `runOnBid.ts`). Free counts cross
unpriced and show "Not priced".

**Where it shows.** A "This bid, all sheets" section already exists at the
foot of the counted-items panel. The summary replaces its three lines with
two headings, "On the bid" and "Not on the bid yet — N", and the second one is
**amber and open** whenever N > 0. The same N goes into the bid screen's
existing amber "from plans" strip. Today that strip counts only counts, and
audit #2 is that unsent RUNS are invisible there.

**Refresh.** Add the query to `BID_QUANTITY_QUERIES` in
`client/src/lib/takeoffRefresh.ts`, so every existing change kind refreshes it.
Also add change kinds for "sent to bid", "line removed" and "lock toggled",
which do not exist yet (§ 7). Then **look at the screen, act, and look again**.
A number that does not move when a mark is placed is the 2026-09-19 failure.

**Measure first.** Is the query fast enough on the 500-sheet set? It reads
every run on the bid. Time it before choosing where it is cached.

---

## 3. "Send all to bid"

**Shape.** A button in the summary's "Not on the bid yet" heading: **"Send
N to bid…"**. It opens one dialog, the § 1.1 component in its non-destructive
colour, with two lists:

- **Will go on the bid (N):** name, quantity, unit, "new line" or "updates
  line", one row each. An unpriced item says **"Not priced"**, never $0.
- **Cannot go on the bid (M):** name and the § 2 reason, one row each. **Never
  silently left out.** The dialog cannot open with this list hidden.

One button: **"Send N to bid"**. Default focus on Cancel, as § 1.1.

**Server: `takeoffBridge.sendAll({ bidId, expect: [ids] })`, one
transaction.** It loops the existing `takeoffGroups.sendToBid` and
`takeoffRunTypes.sendToBid` logic, moved into shared functions so the single
send and the bulk send cannot drift. `expect` is the list the preview showed.
If the server's list differs (the drawing moved while the dialog was open),
it refuses with "Something changed since you opened this — check the list
again", rather than sending a set nobody saw.

**Sending twice cannot duplicate.** This is already true in the database:
`unique(bidId, takeoffGroupId)` and `unique(bidId, takeoffRunTypeId,
runMaterialRole)` (`drizzle/schema.ts:4189, 4193`). A second send updates in
place or skips with "already on the bid". **One thing to check first:** those
indexes include ARCHIVED lines, while `sendability` ignores them. So a count
whose line was archived may pass the preview and then fail to insert on the
index. A test re-sends an archived count before anything is built on it.

**Locked bids refuse it.** This is Question 1, because it contradicts a tested
decision for the single send. The brief asks for it, and it is the safer
reading of "a locked bid must not change". If the single send stays allowed,
the two will say different things on the same bid, so the recommendation is
to refuse both.

**Items that cannot be sent are never sent as $0.** That is already true:
an unpriced count crosses with NULL costs and shows "Not priced"
(`lineNotPriced.ts`). The bulk path goes through the same function.

**Tests that fail without it:**

- send all twice, and the line count and quantities are identical;
- a locked bid refuses and writes nothing;
- one unsendable item among five: four sent, one listed with its reason, none
  at $0;
- a changed `expect` is refused;
- an archived line is re-sent (the index question above).

---

## 4. Manual-workflow audit — one bid, start to end, by hand

Walked as a first-time estimator: upload → scale → count → trace → set ends
→ send → bid → quote panel. **This is a code read of the screens and their
wording, not a click-through.** The items marked † were confirmed by reading
the code again for this plan. The rest are as reported and want a look
before they are fixed.

Ranked by **wrong-number risk first**, then by how often people hit it.

| #   | Risk | How often                             | What the estimator meets                                                                                                                                                                                                                                                                                                                                                                      | Fix                                                                                                                     |
| --- | ---- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1†  | High | Every bid with conduit                | **A new conduit run carries no wire.** The type says "3 #12", but a run starts with zero circuits, by design (`runToBidWire.test.ts:176`, "the honest starting state"). So the bid gets pipe and no wire, and the row says "Wires in this pipe: none" **in grey**. Switching a run to quantity mode does copy the type's wires, so the two modes disagree.                                    | Make "none" amber: "No wire on the bid for this pipe". Question 5: should a finished run get one circuit from its type? |
| 2   | High | Every bid                             | **Traced runs that were never sent are flagged nowhere downstream.** The bid's amber "from plans" strip counts only counts (`bidsRouter.ts:124-161`). Sending a run type is a small grey link.                                                                                                                                                                                                | § 2 puts unsent runs in the strip.                                                                                      |
| 3   | High | Often                                 | **The quote panel doesn't check for unsent takeoff.** `quoteGaps` looks only at lines already on the bid (`shared/quoteAppExport.ts:98`). A bid with 12 unsent counts produces clean figures.                                                                                                                                                                                                 | Feed § 2's "not on the bid" count into the quote gaps.                                                                  |
| 4†  | High | Rare (needs a failed send)            | **Marks can be counted as the wrong item.** `flushStamps` sends every unsent mark under `batch[0].groupId` and `batch[0].sheetId`. A failed batch goes back to unsent, so the next flush can mix count A's leftovers with count B's new marks, all under A. The crash-recovery path does the same. This is the same class as the 2026-09-19 fault in CLAUDE.md, left open for the retry path. | Split every flush by (sheet, count). A `client/src/lib` function with a test.                                           |
| 5   | High | Every bid                             | **Counts go to the bid one at a time through a faint link**, and "N counts are not on the bid yet" is grey text with no button.                                                                                                                                                                                                                                                               | § 3.                                                                                                                    |
| 6   | Med  | Every bid                             | **An unanswered run end counts no drop, and says so in grey** ("not set — no drop counted", `runEnds.tsx`). The same state on a count is amber with a triangle (`GroupDrop.tsx`). Verticals are the big missed footage.                                                                                                                                                                       | Amber, the same as the count.                                                                                           |
| 7   | Med  | Often                                 | **From/To end pickers carry over to every new run** (the sticky choice), so a drop is counted from the previous run's choice.                                                                                                                                                                                                                                                                 | Name the ends in the "Run finished" toast.                                                                              |
| 8†  | Med  | Occasional                            | **"Clear" on a sheet's scale is one click**: no confirm, no toast, no undo, **not refused on a locked bid**. Every measured run on the sheet leaves the totals.                                                                                                                                                                                                                               | Question 3.                                                                                                             |
| 9   | Med  | Often (typos)                         | **A typed scale the app can't read is dropped silently**, and the old scale stays with nothing saying so (`ScaleControl.tsx:207`).                                                                                                                                                                                                                                                            | Say "Couldn't read that" inline, and keep the box open.                                                                 |
| 10  | Med  | Often                                 | **A detected scale applies itself** with a quiet grey "Detected". A sheet with details at several scales is the risk.                                                                                                                                                                                                                                                                         | Amber "Detected — check it" until checked.                                                                              |
| 11  | Med  | Rare                                  | **"Keep" after a check that disagreed still shows a green "checked"**.                                                                                                                                                                                                                                                                                                                        | Store and show "checked — didn't match".                                                                                |
| 12  | Med  | Often                                 | **Draft runs are priced** (on purpose, 2026-09-27), and the only sign is a grey badge and faded "Includes N runs not finished yet".                                                                                                                                                                                                                                                           | Amber, with a way to jump to each draft.                                                                                |
| 13  | Med  | Every conduit run past the bend limit | **Unanswered pull points** say "to review" on the row, but Send does not say whether the LB is on the bid.                                                                                                                                                                                                                                                                                    | List them in the Send preview (§ 3).                                                                                    |
| 14  | Med  | Often                                 | **Removing a bid line** is a hover-only X with no confirm and no undo (§ 1.2 m).                                                                                                                                                                                                                                                                                                              | § 1.1.                                                                                                                  |
| 15  | Med  | Often                                 | **A Send that added nothing shows a green success toast** ("Nothing added. 2 not sent: …", `TakeoffPage.tsx`).                                                                                                                                                                                                                                                                                | A warning toast whenever anything was not sent.                                                                         |
| 16  | Med  | Every bid                             | **Enter in the run-type search arms the top fuzzy match**, so a typo can arm a different type with no toast.                                                                                                                                                                                                                                                                                  | Enter creates unless the match is exact; the toast names what is armed.                                                 |
| 17  | Med  | Rare                                  | **The quote panel's blocked message says "Price them on the bid"** even when the gap is a labor rate.                                                                                                                                                                                                                                                                                         | Advice per gap.                                                                                                         |
| 18  | Low  | Every bid                             | **One setting, six names**: "drop heights", "run height", "distribution height", "Pipe runs at", "Continues at run height"…                                                                                                                                                                                                                                                                   | Pick one ("run height") and use it everywhere.                                                                          |
| 19  | Low  | Every bid                             | **"No drop" has five wordings**, including "drops to nothing".                                                                                                                                                                                                                                                                                                                                | One term per state.                                                                                                     |
| 20  | Low  | Often                                 | **"Type" means two things**: "Use the type's height" means the device's kind, not the run type.                                                                                                                                                                                                                                                                                               | "Use the receptacle's height".                                                                                          |
| 21  | Low  | New users                             | **The getting-started checklist requires the library** ("Price your first material", "Build your first assembly"). A by-hand user never finishes it, which conflicts with CLAUDE.md § "As manual or as automated as the user wants".                                                                                                                                                          | Make both optional.                                                                                                     |
| 22  | Low  | Often                                 | **"Count" means two things**: the bid header's type-in screen and the Plans screen's mark tool.                                                                                                                                                                                                                                                                                               | One name per screen.                                                                                                    |
| 23  | Low  | Often                                 | **"Send" goes both ways**: "Send to bid" pulls inward, and the bid's "Send" menu (proposal, supplier list) goes outward.                                                                                                                                                                                                                                                                      | Rename the bid's menu "Share".                                                                                          |
| 24  | Low  | New users                             | **The by-hand count is hidden** until a name is typed, and the intro says "Set each sheet's scale, then mark" while the Count popover says "No scale needed".                                                                                                                                                                                                                                 | Show "Count something not in your library" always, and fix the intro.                                                   |
| 25  | Low  | Occasional                            | **Unpriced lines have two policies**: the quote panel blocks, while the proposal asks, and its Cancel is "Back to the bid", which leaves the page.                                                                                                                                                                                                                                            | One policy.                                                                                                             |
| 26  | Low  | Occasional                            | **Three things are called Undo**: the toolbar, "Undo drops" and the pull-point "Undo".                                                                                                                                                                                                                                                                                                        | Only the stack is "Undo"; the others become "Take back".                                                                |

**The first four together** let a bid look finished while traced wire,
traced runs or counts are missing from it, and the quote panel then produces
clean figures from it. That is the order to fix them in.

---

## 5. Two checks, answered

### 5.1 Does dragging a point also pan the sheet?

**No.** A run point handle's `begin()` calls `stopPropagation` and
`preventDefault` (`TraceLayer.tsx` ~1501). The "+" handles and pinned tee ends
do the same. So the drag never reaches `beginPlainPan`.

Three related findings:

- **Space-drag on a handle pans rather than drags.** It is a capture-phase
  listener, and looks intended.
- **A drag that starts on a MARK pans** (marks are not draggable), and the
  `click` on release then **selects the mark**. A pan followed by the Delete
  key deletes something never meant to be picked. § 6 fixes this.
- **Calibrating does NOT stop the event** (`CalibrateLayer.tsx` ~931). A
  calibration click also starts a pan. That is harmless only because the sheet
  is centred at fit today, and § 6 would make it real.

### 5.2 Are there old runs where a stub longer than 3 page points may remain?

**Yes, and new ones can get them too.**

- `STUB_POINTS = 3` (`shared/runBends.ts:267`) is applied **only when bends are
  counted**, in `directionalVertices`. It never rewrites stored points.
- No save-time cleanup exists (`save`, `setPoints`, `runPointEdit.ts`), and no
  migration or backfill has touched run points.
- So **a stub of more than 3 page points in any existing run is still read as
  a turn and can still buy an elbow.**
- The new-trace guard is `REPEAT_CLICK_PX = 4` **screen** pixels
  (`client/src/lib/traceClick.ts`). At 19% zoom that is about 21 page points,
  so a double-click that drifts 5–20 px at low zoom still adds a point the
  3-point backstop does not catch. The tests cover about 1 page point of drift
  (`server/runBends.test.ts:789`).

**Measure before fixing:** a read-only script listing every run with a
segment between 3 and 30 page points, with its sheet and whether it bought an
elbow. The fix (the guard in page points, or a threshold scaled by zoom) is
decided on that number, not on this paragraph.

---

## 6. Panning when zoomed out

### 6.1 How it works now

- **One transform** on a wrapper holding the canvas and the overlay:
  `translate(x, y) scale(zoom)` (`TakeoffPage.tsx` ~1745).
- **Plain left-drag on empty sheet**: `beginPlainPan` (~1035). **Right-,
  middle- and Space-drag**: a capture-phase listener (~1064). Moves are
  tracked on `window` and pass through `clampView`.
- **Wheel and trackpad always ZOOM** about the pointer. A two-finger trackpad
  scroll zooms rather than pans, and `deltaX` is ignored. **There is no touch
  handling at all:** no `touch-action`, so a phone's browser takes a finger
  drag for its own scrolling.
- **No momentum and no animation.** A point or mark is placed on pointerdown,
  from a fresh `getBoundingClientRect`.

### 6.2 Why it stops when zoomed out

`clampView` (`client/src/lib/planView.ts:164`): **when the whole sheet fits,
it forces both axes to centre and throws the pan away.** Fit zoom is in that
state by definition, so from Fit down to `MIN_ZOOM` a drag does nothing. That
is the "stuck" feeling. It was a recorded decision ("centre both — deliberate
and stays"), made to fix the per-axis fault.

### 6.3 The fix

**Use the overlap rule at every zoom.** Delete the "whole sheet fits → centre"
branch. The existing rule (`offset ∈ [keep − scaled, viewport − keep]`, with
`keep = viewport × MIN_VISIBLE_FRACTION`) already handles a sheet smaller than
the pane. It is one rule with no jump anywhere in the zoom range, which is the
same argument that fixed the per-axis fault. `fitView` computes its centred
offsets itself instead of calling `clampView({x:0,y:0})`. Fit and `0` stay the
way home, and a page flip still refits.

**"A little" needs a number.** The overlap rule lets a small sheet travel
until only a quarter of the pane still holds it, which may be more than "a
little". **Measure it on screen first**, at Fit on a real 36×24 sheet in the
real pane. If it is too loose, keep one rule but cap the slack at
`0.15 × viewport` when the sheet fits, **interpolated** as the sheet grows past
the pane so there is no jump.

**The editing rules, each with a guard rather than a comment** (CLAUDE.md §
"a comment claiming that SOMETHING ELSE handles it"):

- **Dragging empty sheet pans.** It needs a 4 px threshold before the pan
  starts, so a click stays a click.
- **Dragging a point, a mark, a run or a box edits that item and never
  pans.** Points already `stopPropagation`. Add it to **CalibrateLayer's
  pointerdown**, and to a mark's and run's pointerdown when the drag passes
  the threshold. After a real pan, **swallow the `click`**, so a pan never
  selects what it started on.
- **Panning never moves a mark or changes a measurement or scale.** This is
  true by construction: the pan is a CSS transform, and page coordinates come
  from `getBoundingClientRect` at the event. A test pins it: in `planView`,
  the page point under the pointer before and after a pan maps back to the
  same page coordinate.
- **The same on trackpad, mouse and phone.**
  - **Trackpad:** two-finger scroll PANS, and pinch (`ctrlKey` on the wheel)
    ZOOMS. That is the platform convention. Today everything zooms, so this
    is a behaviour change worth its own line in the changelog.
  - **Mouse:** the wheel keeps zooming.
  - **Phone:** `touch-action: none` on the viewport, one finger pans, two
    pinch. It is its own piece, because it touches every overlay's pointer
    handling.

**Tests.** Three `planView.test.ts` cases assert the old centring and must be
rewritten: "centres a drawing smaller than the viewport and ignores the pan",
"treats zoomed-out-below-viewport as small", and "centres both axes again the
moment the whole sheet fits". **Add fixtures that are NOT the viewport's
shape**: 2000×600 and 600×2000 in the 800×600 pane (CLAUDE.md § "A test
fixture shaped like its container"). At Fit, assert:

- a (+40, +40) drag moves both axes by 40;
- a hard shove stops at the limit;
- `fitView` still centres.

### 6.4 What could put a wrong number on a bid

- **A pan that selects, then a Delete.** The drag-starts-on-a-mark path in
  § 5.1. With slack at low zoom, drags get far more common. **Fix in the same
  change** (swallow the click after a pan).
- **Calibration clicks on a moving sheet.** Each point is still read
  correctly, but the user aims at a sheet sliding under them, and the scale
  multiplies every run on the sheet. **Fix in the same change**
  (`stopPropagation` in CalibrateLayer).
- **A pan while tracing does not shift a clicked point**: points are taken on
  pointerdown from the live transform, there is no momentum, and armed
  overlays stop the event. **One new risk to guard:** if two-finger trackpad
  scroll starts panning, a trace click landing _during_ a scroll gesture is
  still read correctly, but the user may have aimed before the sheet moved.
  Ignore clicks within 100 ms of a wheel pan while a tool is armed. Measure
  whether that is needed before building it.
- **Vertex jitter.** A press on a point handle commits a move on any pointer
  movement (`TraceLayer.tsx` ~609, no threshold). This is not caused by the
  pan, but it sits beside it. Use the same 4 px threshold.

---

## 7. What needs a migration, and what could put a wrong number on a bid

### 7.1 Migration (Track A)

**None of §§ 1–6 needs one.** Every piece is queries, UI and procedures on
existing columns. The unique indexes § 3 relies on already exist. The undo
stack in `sessionStorage` is client-only.

A migration would only be needed for choices this plan does not make:

- an audit record of each Send all;
- a stored "checked — didn't match" on a sheet's scale (audit #11), which
  needs a column. If wanted, that one goes to Track A;
- any cleanup that REWRITES stored run points to remove stubs (§ 5.2). That
  would be a **meaning** migration (it changes what existing rows say), so it
  ships after the code, as step 3.

### 7.2 Wrong-number risks, in one list

Ranked. Those marked **(open)** exist in the app today.

1. **(open)** A conduit run with no wire on the bid, shown in grey (audit #1).
2. **(open)** Unsent runs invisible on the bid and the quote (audit #2, #3).
3. **(open)** A failed mark batch re-sent under the wrong count (audit #4).
4. **(open)** A plan set can be removed from a **locked** bid, taking its marks
   and runs (§ 1.2 k). The locked lines hold, but unlocking re-reads a drawing
   with holes in it. **The same class Part 1 closed, still open by this door.**
5. **(open)** A sheet's scale can be cleared, or changed, on a **locked** bid
   (§ 1.2 j). The same class again: every measured run on the sheet changes
   length behind a frozen line. See Question 3.
6. **(open)** Stubs over 3 page points still buying elbows (§ 5.2).
7. **(open)** Unanswered drops and unchecked scales shown in grey (audit
   #6–#10).
8. **(would be new)** Send all sending a list different from the one
   previewed. Guarded by `expect` in § 3.
9. **(would be new)** A pan selecting what it started on, then a Delete. Guarded
   in § 6.
10. **(residual, from Part 1)** A tool picked up in the moment before the lock
    state loads. The page puts it down as soon as the lock is known, and the
    server refuses anyway. Marks drawn in that moment stay on screen as unsent
    until reload. Low, and noted rather than fixed.

---

## Questions for the owner

1. **Should a locked bid refuse Send too — the single send as well as Send
   all?** Today a single send on a locked bid is allowed and arrives frozen, a
   tested decision. _Recommendation: refuse both,_ so one bid never gives two
   answers. "A locked bid must not change" reads that way.
2. **Should Undo history survive leaving the Plans screen?** _Recommendation:
   yes, within the same tab (`sessionStorage`), not across tabs or devices._
3. **Should a locked bid refuse scale changes, and removing a plan set?** Both
   change the drawing behind frozen lines. _Recommendation: yes, both,_ with
   the same sentence as Part 1. They are the last doors of the same kind.
4. **Should a locked bid refuse removing a bid LINE?** A hand-added line is
   not a quantity from the plans. _Recommendation: no_ for hand-added lines,
   **yes** for lines from the plans.
5. **When a conduit run is finished, should it get one circuit from its run
   type automatically?** Today it gets none, so no wire goes on the bid until
   someone adds it. _Recommendation: no silent default (it would add wire
   nobody chose), but make "no wire" amber, and offer the type's wire as one
   tap on the finished-run toast._
6. **How much slack when zoomed out?** _Recommendation: measure the overlap
   rule on screen first, then decide between it and a 15% cap._
7. **Two-finger trackpad scroll: pan (the platform convention) or zoom (today)?**
   _Recommendation: pan, with pinch to zoom._
