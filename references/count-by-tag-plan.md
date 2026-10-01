# Count by tag — one legend symbol, several fixture types

**Status: PLAN ONLY, 2026-10-01 (Track B).** Nothing here is built.

## The problem

One legend row — say LIGHTING FIXTURE, LINEAR TYPE — appears on the drawings
in several sizes. Each copy has a type tag printed beside it, `(A-7)` or
`(A-9)`, which points at a row of the lighting fixture schedule. The legend has
one row, so today the symbol makes one count, and 22 eight-footers and 3
four-footers come out as "Linear: 25" with one price.

What the estimator wants to be able to say:

> Linear, A-7: 22 — Linear, A-9: 3 — each linked to its own assembly (or
> length, or typed price).

## Decisions this builds on (read before changing any of it)

- **`references/track-b-count-pin-styles-plan.md` § 3, "Lighting takes the
  plan's own tag."** A count whose name carries a fixture tag wears that tag as
  its pin letter. This plan is the thing that produces those names, so the two
  must agree on WHERE in the name the tag sits — see § 3 below, which asks for
  one change to that rule.
- **Same plan, § 8 — unconfirmed matches from Track C's Find all matching.**
  Dashed, "?" badge, never counted until confirmed. Unchanged here.
- **`references/takeoff-spec.md` C14 — cross-check against a schedule.** One
  typed number per count, compared with the count. A lighting schedule lists
  quantities BY TYPE, so C14 cannot work on lighting until counts are split by
  tag. This plan is a prerequisite for C14, not a rival to it.
- **`references/plan-viewer-overhaul.md` § 8a** — a legend click makes a plain
  count under the symbol's name, reused when it already exists. Count by tag is
  the same move with a tag added.
- **CLAUDE.md, "As manual or as automated as the user wants."** Splitting by
  tag must work with no library, no assemblies and no AI: a tag and a click.
- **CLAUDE.md, AI rule 1.** Nothing below reads a tag with a model unless a
  button was pressed.

## 1. The simple way: a tag makes its own count

**A tagged count is just a count whose name ends in the tag.** "Linear type
(A-7)" and "Linear type (A-9)" are two ordinary rows in `takeoff_groups`. Each
already has everything the request asks for, because a count already carries
it today:

| Wanted                      | Where it already lives on a count                       |
| --------------------------- | ------------------------------------------------------- |
| Its own quantity            | its marks                                               |
| Its own assembly            | `takeoff_groups.assemblyId` (level 4)                   |
| A length or a typed price   | `unitCost` / `unitHours` / `laborRateId` (level 2)      |
| Its own drop to the fixture | `dropKind` / `dropHeightInches` / `dropRunTypeId`       |
| Its own line on the bid     | Send to bid sends per count (`shared/takeoffBridge.ts`) |
| Its own row in exports      | the takeoff CSV and materials list are per count        |

So the feature is a quicker way to MAKE those counts, plus showing them
together — not a new kind of thing.

**How it works on screen:**

1. **The legend row grows a tag strip.** Under LINEAR TYPE: the tags already
   counted on this bid, each a chip with its count — `A-7 · 22` `A-9 · 3` —
   and `+ Tag`. Nothing new appears until a symbol has been split once; an
   untagged symbol looks exactly as it does today (CLAUDE.md "fold ships
   before the list needs it" — the `+ Tag` is the one control).
2. **`+ Tag` asks one thing: the tag.** A short text box, Enter to go. It makes
   (or reuses) the count `Linear type (A-7)` and arms it — the same path as the
   legend's Count today (`createGroup` with `reuseExisting: true`, then
   `armGroup`).
3. **A chip arms that tag.** One click on `A-9 · 3` and the next clicks are
   A-9s. Switching tags is one click, which matters more since 2026-10-01:
   changing sheet now puts the count down (`client/src/lib/toolOnSheet.ts`),
   so the estimator re-picks after every sheet change and the chips are what
   makes that cheap.
4. **The armed chip in the toolbar says the tag**: "Counting Linear type
   (A-7)". Already true — the label is the name.
5. **Linking.** Each tag count links to an assembly, or takes a typed price,
   exactly as any count does — from its row in the Counts tab. Nothing is
   asked at tag time (D3: decide once, not a form on every run).

**The untagged count stays.** If the symbol was already counted plain ("Linear
type: 25"), splitting does not touch it. The Counts tab shows it beside the
tagged ones with a one-line note — "25 not tagged" — and the estimator can
delete and re-mark, or leave it. See § 5 for why there is no "re-tag" in v1.

## 2. Does it need a database change? Not for v1. Flag for A for v2.

**v1: no migration.** A tagged count is a `takeoff_groups` row with a name.
The tag strip is DERIVED: the counts on this bid whose label is
`<symbol label> (<tag>)`. One pure parser in `shared/` —
`splitTag(label) → { base, tag } | null` — read by the legend strip, the
Counts tab grouping and the pin letter, so there is one reading of a name and
not three (CLAUDE.md "they share the component, not the shape of it").

**Why a parsed name is acceptable for v1 and not for ever.** A rename can break
the link: rename "Linear type (A-7)" to "Linear 8ft" and it silently stops
being an A-7 of the Linear symbol. That costs a chip on the legend row, not a
number — the count, its marks, its price and its bid line are untouched — so
it fails on the "silent on the screen is clutter" side of CLAUDE.md, not the
"silent in the maths" side. Good enough to learn whether people use it.

**v2, FLAG FOR TRACK A (schema owner): two nullable columns on
`takeoff_groups`.**

- `fixtureTag varchar(16) NULL` — the tag, as typed. NULL means untagged,
  which is every existing row, so the migration is purely additive (step 1 of
  the three in CLAUDE.md) and needs no backfill. An optional step-3 backfill
  could set it from labels that parse, but nothing requires it.
- `symbolLookupKey varchar(255) NULL` — which legend symbol the count belongs
  to, as `symbol_links.lookupKey`. Not a foreign key to `symbol_links`, on
  purpose: that table is per USER library and a count is per BID (see below),
  and deleting a library symbol must not touch a bid.

With those, a rename can no longer detach a tag, and the Counts tab can group
by symbol without reading names. Do v1 first; add these when the grouping is
known to be wanted.

**Where the tag→fixture meaning lives: on the BID, never in the library.**
`symbol_links` maps a symbol to an assembly once, for every job, and that is
right for "duplex receptacle". It is WRONG for a tag: `A-7` is a row on THIS
job's schedule and means a different fixture on the next set. So the tag's
assembly is the count's `assemblyId` (per bid), and nothing about tags is ever
written to `symbol_links`. A "remember for next time" offer, if one is ever
made, belongs per architect (`symbol_links` comment, "legend memory per
architect") and is out of scope.

## 3. With count pins, Find all matching, and the fixture schedule

**Count pins (`track-b-count-pin-styles-plan.md`).**

- **Shape and color:** every tag of a lighting symbol is a lighting count, so
  all tags share the lighting SHAPE. Each tag is its own count, so each gets
  its own first-use COLOR — A-7 and A-9 look like siblings that can be told
  apart, which is the point.
- **Letter = the tag, and that plan's § 3 rule needs one amendment.** It
  parses "a LEADING 1–3 character tag" ("A1 luminaire"). Tags on real sets are
  printed as `(A-7)`, `A-12`, `F3a` — four characters is ordinary — and this
  plan puts the tag at the END in parentheses because that is how the drawing
  prints it. **Proposed:** the pin reads a trailing `(…)` tag first, then a
  leading one, up to 4 characters, and drops a hyphen when space is short
  (`A-7` → `A7`). Both files must say so (CLAUDE.md "when a new decision
  overrides an old one, say so in BOTH files") — to be written into the
  pin-styles plan when either is built, not before, so neither file claims
  something unbuilt.
- **Letter-hiding below the measured size** (pin plan § 3) still applies, and
  hurts more here: two tags of one symbol differ ONLY by letter and color. At
  zoom levels where the letter is hidden, color alone separates them. Step 0
  of the pin plan must measure a 3–4 character letter, not just one.

**Find all matching (Track C — not yet in this repo; re-check against
`references/find-all-matching-plan.md` when it lands).**

- Find all matching finds copies of a SYMBOL. The tag beside it is text, not
  the symbol, so matches arrive untagged. Two honest options for v1, in order:
  (a) matches are proposed for the count that was armed when Find was pressed —
  if that is `(A-7)`, every match is an A-7 proposal and the estimator
  rejects the A-9s; (b) matches are proposed for the plain symbol and the
  confirm step offers the tag chips. **(a) is the v1 answer**: it reuses the
  pin plan § 8 look unchanged and adds no step. It is wrong in a visible way
  (dashed "?" marks on A-9s, which the estimator sees and rejects), never in a
  silent one, because nothing is counted until confirmed.
- **v2: read the tag beside each match from the PDF's own text.** Vector sets
  have the `(A-7)` in their text layer, and `bid_pdf_sheet_text` already
  stores each page's text, read once at upload. The nearest tag-shaped token
  within a short distance of the match sorts it into a tag. No model call, so
  no AI rule applies; still a button (Find), never on load. Scanned sets
  (Blueridge, pine st) have no usable text layer — they stay on option (a).
- The same nearest-text idea can PRE-SELECT the tag chip on an ordinary manual
  click, as a suggestion shown on the armed chip. v2, and only when the text is
  there; the chip the estimator armed always wins.

**The fixture schedule (C14).**

- A lighting schedule is a table of TYPES: A-7, A-9, B-1 with catalogue number,
  lamp, length and sometimes quantity. Per-tag counts are exactly its rows, so
  C14's "the schedule says 43 type-A, you counted 40" becomes possible for
  lighting the moment tags exist. Nothing else about C14 changes: one typed
  number per count, compared against the whole bid by default (C14's own
  flagged decision).
- **Later: start tags from the schedule.** A "Types from schedule" action on
  the legend row that offers every tag listed, so the chips exist before the
  first click. Reading the schedule is a model call on Blueridge (scanned,
  OCR degraded — plan-viewer-overhaul.md, measured 2026-09-21, read "Riating") and a text read
  on a vector set. Behind a button, with cost shown, and typing the tags by
  hand stays the product.
- **Schedule columns are not wired to prices.** A schedule's catalogue number
  or length is useful context on the count row, but it never sets a price or
  picks an assembly by itself — a plausible number nobody chose is the failure
  this app is built against.

## 4. Smallest first version, and what waits

**v1 — client and one shared parser, no migration, no AI:**

1. `shared/fixtureTag.ts`: `splitTag(label)`, `withTag(base, tag)`,
   `normaliseTag(input)` (trim, upper-case, collapse spaces; `a 7` → `A 7`,
   kept as typed otherwise — do not invent a hyphen). Tests, including labels
   that merely END in parentheses and are not tags ("Receptacle (existing)"):
   a tag is 1–6 characters, starts with a letter, and contains a digit or is a
   single letter. That rule is a measurement waiting to happen — check it
   against the tag shapes on the two fixture sets before trusting it.
2. Legend row: tag strip (chips with counts from the bid's groups) and
   `+ Tag`, arming through the existing `createGroup` + `armGroup`.
3. Counts tab: tagged counts of one symbol sort together under their base
   name, natural order (A-7 before A-10, never alphabetical — same reasoning as
   `shared/materialSizeOrder.ts`), with a quiet subtotal line
   "Linear type — 25 across 2 types". The subtotal is display only and never
   sent to the bid.
4. Fix the hazard in § 5 (first bullet) in the same change.
5. CHANGELOG, and the on-screen check on the "Bar layout check" fixture
   (E0.01 legend + drawings), including a sheet change mid-tag (the 2026-10-01
   rule: the tag is put down, the chip re-arms it).

**Later, in this order:**

- v2 columns (§ 2) — Track A.
- Pin letter reads the trailing tag (§ 3) — with the pin-styles build.
- "Move selected marks to another tag" — see § 5; also fixes ordinary
  miscounts, so it may arrive for its own sake (C5).
- Tag suggested from the text layer on click and on Find all matching.
- "Types from schedule", then C14 compare for lighting.

**Explicitly not doing:** a per-mark tag field (a mark belongs to a count and
the count says what it is — a tag on the mark would be two answers to one
question); tag-aware symbol recognition; any tag stored in the per-user
library.

## 5. What this could break

- **`groupForAssembly` picks the FIRST count on the bid with that assembly**
  (`server/assemblyGroup.ts:30`). If A-7 and A-9 are both linked to the same
  assembly — plausible when they differ only by a length priced as a typed
  modifier — then the toolbar's Count picker, the legend's "Use symbol" and
  the plan reader's Place all arm whichever tag happens to be first. **Marks
  counted as the wrong type, silently.** v1 must fix this in the same change:
  when more than one count on the bid has the assembly, those doors open the
  tag chooser instead of guessing. Test: two groups, one assembly, `forAssembly`
  must not return either silently.
- **No way to move a mark between counts today.** A mark placed under A-7 that
  is really an A-9 has to be deleted and placed again. Acceptable for v1
  (delete is one key and undoable); the move is listed as later work. Worth
  saying on screen nowhere — it is the same as any miscount today.
- **Group names are unique per bid by the router, not the database** (schema
  comment on `takeoff_groups`). `reuseExisting: true` is what makes a second
  `+ Tag A-7` land on the same count rather than refusing; the tag must be
  normalised BEFORE that comparison or `a-7` and `A-7` become two counts.
- **Renaming** a tagged count detaches it from its symbol's strip in v1 (§ 2).
  Nothing numeric moves. v2 columns remove it.
- **Pin letters** change for any existing count whose name already ends in a
  parenthesised tag, once the pin plan amendment lands. Say it in the
  CHANGELOG with that build, as the pin plan already does for colors.
- **Exports and the bid** get one line per tag where there used to be one per
  symbol. That is the request, but a bid already sent with "Linear type: 25"
  and later split will show the old line (`takeoffBridge` follows the GROUP)
  plus two new ones until the old one is removed — double-counting on the bid
  if nobody removes it. v1 must say so on the untagged count's row when it
  still has a bid line: "25 still on the bid as Linear type — remove it when
  the tags are sent." Check this on screen; it is exactly the kind of fault
  that states a wrong number confidently.
- **AI plan reader proposals** are made per assembly and land through
  `groupForAssembly` — the first bullet covers them.
- **Search in the Counts tab** matches on label, so "A-7" finds the count
  with no extra work. Confirm, rather than assume, that the smart-search
  tokeniser does not split on the hyphen into "A" and "7".
- **Phone layout**: chips wrap inside the legend row; at 360 px a symbol with
  six types is two rows of chips. Check it at 360 × 740 per the track-b phone
  plan before calling it done.
