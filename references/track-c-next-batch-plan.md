# Track C — next batch (2026-09-29)

**Status: APPROVED by the owner (Q1–Q5 as recommended; Q3 given a final rule
and HELD — see § 1 W5). Built pieces are marked BUILT in their section.**
Written on `track-c` at `8c5c478`.
No migrations in this batch: the one item that needs a schema change is
listed as a handoff for Track A (§ 4) and waits on it.

Order, as asked: wrong numbers first (§ 1), then how search reads numbers
(§ 2), then tests that leave rows behind (§ 3).

Every open entry in `todo.md` was read for this (98 unticked). The ones that
state a wrong number, or name the wrong part beside one, and sit in Track C's
area (takeoff counts, the catalog, the deploy tooling) are in § 1. The ones
left out, and why, are at the end of § 1.

---

## 1. Wrong numbers

### W1. The sentence under a sweep row still says "90° elbows"

> **BUILT 2026-09-29** (Q1: name the part, or "bend"). `bendWordsFor` reads
> the SAME chosen 90/45 names as `bendMergeFeetForOverrides`, with the same
> sweep test (`sweepRadiusInches`), so the word and the merge distance
> cannot disagree about whether a type buys sweeps. `countFittings` requires
> `words`; the type check found every caller. Where no part matched, the
> panel and the materials list say "90° bends" (`unmatchedKindWords`).
> `runBendsBridge.test.ts` "a sweep type's sentence names the sweep": red on
> `3b49727` with the exact old sentence, "At least 1 90° elbow: 1 corner".

**What is wrong.** A run type set to buy sweeps sends
`2" PVC Sch 40 90-degree sweep, 36" radius`, and the caption under that row
reads "At least 2 90° elbows: 2 corners …". The count is right; the part it
names is not. CLAUDE.md rule 7: a caption naming the old thing beside a number
carrying the new one reads as confirmation.

**Where.** `FITTING_KIND_LABELS` (`shared/runFittings.ts:166`,
`elbow90: "90° elbow"`), the counted sentence in `shared/runBends.ts:713`, and
the panel's heading table (`RunsPanel.tsx:537`, same table).

**Plan.** The kind stays `elbow90`; the WORD comes from what the run type
buys. Sweep type → "90° sweep(s)"; factory elbow → "90° elbow(s)"; field bend
already says "field bend". Same for 45s. One function
(`bendWordFor(kind, runType)`) that both the server sentence and the panel read,
so they cannot disagree (CLAUDE.md § "Copying a layout does not copy the
behaviour").

**Test that fails without it.** `runBends.test.ts`: a sweep run type's sentence
contains "sweep" and not "elbow"; an elbow type's is unchanged.
**Screen check:** the run panel on a sweep type, then on an elbow type.

**Question Q1** (wording is the owner's call, todo says so): name the part the
run type buys (recommended), or say "bend" on every raceway?

### W2. `schemaDrift.mts` says "never been migrated" when it cannot connect

> **BUILT 2026-09-29.** Measured first: drizzle wraps the driver error and
> the real code is on `cause` — `ER_NO_SUCH_TABLE` / 1146 for a missing
> table, `ECONNREFUSED` for a refused port. `isMissingTable` reads both;
> anything else throws, and the script prints "Could not read this database
> (ECONNREFUSED). This is NOT 'never migrated'" and exits 2.
> `scripts/schemaDrift.test.ts` RUNS the script: against port 1 (red on
> `50618c9`, which printed "never been migrated"), and against an empty
> scratch schema, which must still say "never been migrated". `deploying.md`
> § 10's warning now says it was fixed, with the old wording kept.

**What is wrong.** `server/schemaCheck.ts` ~489–495 reads the migration count
inside `try { … } catch { }` and treats EVERY error as "the table is absent".
A timeout, a refused connection or a bad password all print "No
\_\_drizzle_migrations table — this database has never been migrated." Measured
2026-09-27 against production (89 applied) from off the trusted list. A false
"never migrated" invites re-running every migration against live data.

**Plan.** Catch only MySQL's `ER_NO_SUCH_TABLE` (1146) as "never migrated";
anything else is thrown and printed as "could not read the database: <reason>"
with a non-zero exit. The check stays read-only.

**Test that fails without it.** `schemaCheck` unit test with a fake db whose
query rejects `ETIMEDOUT` → must reject, not return 0; one rejecting 1146 →
returns "never migrated". Then remove the warning in `references/deploying.md`
§ 10 that exists only because of this.

### W3. `schemaDrift.mts` says a missing key's migration "is already recorded as applied" when it is not

> **BUILT 2026-09-29.** `linkOrigins` matches each missing key to the
> migration that names its constraint and decides pending/applied with
> `pendingMigrations` — the same rule `migrate.mts` uses. `describeForeignKeyDrift`
> now REQUIRES the origins, so no caller can fall back to the fixed sentence.
> Tests in `server/schemaDrift.test.ts`: 4 red on `d3da6e9`. End to end on a
> scratch schema migrated to 96, ledger rolled back to 89 and the two keys
> dropped: the old script printed "already recorded as applied" and two
> ALTERs; the new one prints "Not applied yet — scripts/migrate.mts adds
> these … 0089_takeoff_extra_defaults adds …, 0095_group_drop_run_type_fk
> adds …" and no ALTER.

**What is wrong.** Measured 2026-09-29 on `bidrender_test_c` at 89 of 96: it
listed two missing foreign keys and said the migrations declaring them were
applied, then printed hand-written `ALTER TABLE … ADD CONSTRAINT` lines. Both
keys came from 0089 and 0095, which were pending. The sentence is a fixed
string (`server/schemaCheck.ts` ~712). Harm: someone adds a key by hand, then
the real migration dies on a duplicate constraint.

**Plan.** For each missing key, find the migration file that declares it
(search `drizzle/*.sql` for the constraint name) and compare with the journal
rows the database holds. Pending → "0095 adds it — run migrate.mts". Applied →
today's text and the ALTER. Not found in any file → say that.

**Test that fails without it.** A fixture journal and two fixture migrations:
a key from a pending one must not print "already recorded as applied".

### W4. A cable run's tee buys no box

> **BUILT 2026-09-29.** Two things the plan did not know, both measured:
>
> - **The box is `4" square box`, not `4" square box, 2-1/8" deep`** as this
>   section proposed — the owner's answer said "a 4" square box and blank
>   cover", and that is exactly the pair a small-pipe tee already buys. One
>   constant, `SMALL_TEE_BOX`, now names it for both.
> - **Pipe and cable cannot meet at a tee.** The "mixed EMT/MC tee" test
>   below could not be traced: a cable branch on a conduit run is refused.
>   Pinned instead; `cableTeeOwners` keeps a tee any pipe meets with the
>   pipe for the day that changes.
>
> Cable rows did not even carry their tees (`runTypeFootageCore.ts`
> collected them for conduit only); now they do, and legs stay conduit-only.
>
> **And a second wrong number, in the send:** `sendToBid` decided tee
> ownership from the ONE type being sent, so two pipe sizes sharing a tee,
> sent one at a time, stored two boxes. Now the send counts every type and
> takes its own rows. `server/cableTeeBox.test.ts`: the cable tee and the
> two-size send are both red on `1f66d7d`.

**What is wrong.** A branch on a cable run (MC, NM) counts footage and drops
but no junction box at the split — a quantity silently short, one box per tee.
`teeBoxOwners` (`shared/runNetwork.ts:299`) ranks by raceway size; a cable type
has none, and cable types get no fitting lines at all.

**Plan.** No schema change: the `teeBox` / cover roles already exist on
`bid_line_items.runMaterialRole` (0085). A cable type's tee buys a box by a
fixed rule instead of by raceway size. A conduit leg at the same tee still
owns it (largest raceway), so nothing moves on conduit-only bids.

**Test that fails without it.** An MC run with one tee sends 1 box + 1 cover;
a mixed EMT/MC tee buys one box, owned by the EMT type.

**Question Q2:** which box does a cable tee buy? Recommend
`4" square box, 2-1/8" deep` plus `4" square blank cover` (what an MC or NM
splice goes in), the same pair for every cable type.

### W5. Locknuts and bushings are never counted — HANDOFF TO A first

**What is wrong.** A rigid or IMC run, or EMT into a panel, buys a locknut
per connector and a bushing on the larger sizes. The rows exist
(`<size> conduit locknut`, `<size> conduit bushing`); nothing counts them, so
every such bid is short by those parts with nothing on screen saying so.

**Why it waits.** A line is keyed by run type + `runMaterialRole`, and there
is no `locknut` or `bushing` role. Appending them is a migration → § 4.

**Plan after A's migration.** Count one locknut per connector end
(`countFittings` already knows the ends), bushings per Q3, send as two more
fitting lines with sentences like the others.

**Question Q3:** bushings on which runs? Recommend every rigid/IMC end, and
EMT/other ends from 1-1/4" up (where a #4 or larger conductor usually is,
NEC 300.4(G)). Locknuts: one per connector end on every conduit family that
uses a threaded connector into a knockout.

> **Q3 ANSWERED 2026-09-29 (owner) — and HELD, not built.** The rule: one
> bushing per conduit end at a box or enclosure — ALWAYS on 1-1/4" and up
> (no wire-size check), ALWAYS on rigid and IMC at any size, and on smaller
> conduit only when the wire is #4 or larger; SKIP where the box has a
> threaded hub or its own smooth entry, or where the connector row says it
> includes the insulated throat. Locknuts: the same check, skipped where the
> connector already includes one. Held until A adds the two roles. What was
> asked for before building, measured:
>
> 1. **No connector row says it includes a locknut or an insulated throat.**
>    All 71 conduit-connector rows (EMT set-screw, compression and raintight;
>    PVC 40 and 80; rigid; IMC — 9 sizes each; FMC and LFMC — 4 each) were
>    searched in name, aliases and description: none mentions either. So the
>    "skip where included" condition matches nothing today, and the rule as
>    written would count a locknut and bushing at every end. The catalog has
>    to SAY it first — see A2 in § 4.
> 2. **Wire size is known per RUN TYPE, not per run.**
>    `takeoff_run_types.conductorMaterialId` names the conductor, and its size
>    reads through `CONDUCTOR_SIZES` (`shared/materialSizeOrder.ts`), so
>    "#4 or larger" can be answered for any type that names a conductor. Runs
>    and circuits hold counts only, no size. **A type with no conductor
>    chosen has no wire size — the owner's "tell me and we'll decide" case.**
> 3. **Whether the box at an end has a hub is not known.** A run end records
>    its KIND (device, distribution, …), not the box. The app knows hubs only
>    for LB bodies (`lbHubsTakeConnectors`); tee and pull boxes are knockout
>    boxes. So "skip at a threaded hub" can be applied at LBs today and
>    nowhere else without a new answer per end (A3).

> **Fact 2 ANSWERED 2026-09-29 (owner) — the no-wire-size case.** On small
> conduit (under 1-1/4", not rigid or IMC), where the bushing depends on
> wire size: if the run type has NO conductor chosen, count NO bushing and
> say so on screen, beside the type's fitting lines: **"wire size not set,
> bushings not counted"**. Nothing is guessed. The warning is the point: a
> blank would read as "no bushings needed", and a guessed size would be a
> number nobody chose. Rigid, IMC and 1-1/4"-and-up ends are unaffected;
> they count a bushing without asking the wire. Still held for A1. Also in
> `references/track-c-retail-catalog-plan.md` § R8.

### Left out of this batch, and why

| Item                                                            | Why not now                                                                                                 |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| "Nobody has priced this" needs its own signal                   | Blocks the priced-catalog upload, not beta. Likely needs a column: Track A's, when the upload is scheduled. |
| Dashboard newest-plan date 7 h early locally                    | Track B's screen; production is unaffected (UTC session). Needs one connection-wide rule, its own look.     |
| Double counting from a user's own assembly (elbows, connectors) | No guard, by the owner's decision 2026-09-26.                                                               |
| Lines sent before `1956a90` read "0 h"                          | Cannot be told apart from a set zero; production had no bid lines then.                                     |
| Flex straps say "No catalog strap"                              | Honest, not wrong — the screen says the part is missing. Needs sized flex strap rows; a catalog item later. |
| Re-apply on a pre-markup line reads today's links               | Track B's markup work.                                                                                      |

---

## 2. How search reads a number

### S1. A COUNT number matches inside and at the start of SIZES — root cause of three wrong results

> **BUILT 2026-09-29.** The count rule is one module,
> `shared/searchCounts.ts`, read by BOTH halves of search — the matcher
> (`smartSearch.ts`) and the ranker (`materialSearchRank.ts`). Fixing the
> matcher alone was not enough, and that was measured: the ranker still read
> "1" as present in `1/2"` and absent from "Single-gang", so "1 gang box" kept
> leading with weatherproof boxes. A count now matches the number or its
> spelling joined to its noun (`2-gang`, `2g`, `double-gang`, `single-pole`,
> `30-space`), or standing alone with the noun next to it ("two gang",
> "3 hole") — never a size, never another noun's count.
>
> **Sweeps:** the count sweep (`searchSpotCheck.mts --counts`, 46 queries,
> new, "2 gang box" in it) was recorded on the unchanged code FIRST. After:
> **the standard sweep is byte-identical (58 queries)**; 40 of 46 count
> queries moved, every one listed in § S1-moved below. Three now return
> nothing, all honestly: no 3- or 5-hole strap is in the catalog, and a quad
> breaker is described as two 2-pole circuits, not four.
>
> **Two catalog rows had lost words to `aliases()`**, which drops a repeated
> word: `EMT strap`'s "one hole … two hole" was stored as "one hole 1 two 2",
> and my own weatherproof "3 hole 5 hole" as "3 hole 5". Both now hyphenated
> (`two-hole`, `5-hole`). Whether other rows lost phrases the same way is not
> audited — logged in todo.md.
>
> **Tests:** `server/searchCounts.test.ts` (the rule) and a block in
> `materialSearchRank.test.ts` against the shipped catalog. Run against the
> unfixed code in a worktree: **11 red** — the six queries that were wrong,
> the "2 gang box" top-five check, and all four "never lists a size" checks.
> The five that were already right passed there too, as intended.

**Found while planning this, and one of the three is mine:**

| Query        | Top of the list today                                               | Should lead with                                 |
| ------------ | ------------------------------------------------------------------- | ------------------------------------------------ |
| "2 gang box" | FS cast 2-gang, Handy box, **`1/2" weatherproof box, single-gang`** | Double-gang box                                  |
| "3 hole"     | `3/4" EMT one-hole strap`, `3" EMT one-hole strap`, …               | the weatherproof boxes ("3 hole" is their alias) |
| "2 pole 20"  | `20 ft light pole`                                                  | 20A 2-Pole breaker                               |

**"2 gang box" is a regression from `8c5c478`** (the weatherproof boxes).
Measured in a clean worktree at `e70ec15`: `Double-gang box` was 4th; after
the rename, `1/2" weatherproof box, single-gang` took a top-five place and
pushed it out. The standard spot-check sweep did not contain this query, so it
passed.

**Cause, read from the code.** `smartSearch.ts` already knows "3 hole" is a
count: `expandTokens` sees the count noun after the number and matches the
number AS A WORD (`asWord`, ~line 817). But a word match is fuzzy by design —
it accepts a word that STARTS with the term and, at a lower tier, one that
CONTAINS it. So the count "3" matches the size `3/4"` and `3"`, and the count
"2" matches inside `1/2"`. Strict size matching (added 2026-09-25, "never fuzz
numbers") was written for SIZE terms; count terms went back to the old fuzzy
path on purpose, to find "Double-gang box" for "2 gang box", and took the fuzz
with them.

**Plan.** A count number matches only:

1. a whole word equal to it ("2"),
2. the number of a count token in the item ("2-gang", "3-way", "2-Pole"),
3. its spelled-out forms through the alias map (double, two, single, one) —
   as today,

and never the start or inside of a word that is a SIZE (carries an inch mark,
a fraction, `#`, an amp or `ft` marker — the same test `sizeKey` uses).

**Risk to other searches, stated before touching it.** This changes every
query that has a number followed by a count word, and those are some of the
commonest searches in the app. What could move:

- Queries that today reach the right row ONLY through the fuzz. Candidates:
  "1 hole strap" (straps are named "one-hole"; "1" today also prefix-matches
  `1"` and `1-1/4"`), "1 pole" ("Single-Pole"), "2 light", "20 space",
  "2 circuit". If the alias map does not cover them, they would LOSE results.
- The order within results where the fuzz currently ranks a right row higher
  than its alias would.
- Nothing about SIZE terms moves: the change is inside the `asWord` path only.

**How the risk is bounded:**

- Before touching the code, add a COUNT sweep to `scripts/searchSpotCheck.mts`:
  every count noun (gang, pole, way, hole, head, light, space, circuit) with
  the numbers people type (1–6, 20, 30, 40, 42), bare and with a following
  word ("2 gang box", "3 way switch", "2 pole 20"). Record it on the current
  code. That is the before.
- After: the standard sweep must not move at all; the count sweep may move
  only where the before was wrong, and every moved query is listed in the
  commit with before and after.
- Pin the three rows above plus "1 hole strap", "3 way", "4 gang", "2 pole"
  in `materialSearchRank.test.ts`. They go red on today's code (the first
  three) or stay green (the rest) — both halves are the point.

**Question Q4:** accept the rule above, including that a count never matches
a size? Recommend yes. If you would rather not touch search now, the
catalog-only stopgap for "2 gang box" is to mark `Double-gang box` "common"
(`shared/materialCommonness.ts`); it does not fix "3 hole" or "2 pole 20".

#### S1-moved: every count query whose top five changed (40 of 46)

Ranked the way the picker ranks (`searchSpotCheck.mts --counts`). The six not listed were unchanged: "2 gang mud ring", "1 pole 20", "3 pole 60", "4 way switch", "30 space", "42 space".

- **"1 gang"**
  - before: 1-gang blank plate · 1/2" weatherproof box, single-gang · 1/2" FS cast box, 2-gang · 1/2" weatherproof box, double-gang · 1/2" weatherproof box, single-gang, PVC
  - after: 1-gang blank plate · Single-gang box · Single-gang metal box · Single-gang box extender · Single-gang box, deep
- **"1 gang box"**
  - before: 1/2" weatherproof box, single-gang · 1/2" FS cast box, 2-gang · 1/2" weatherproof box, double-gang · 1/2" weatherproof box, single-gang, PVC · 1/2" weatherproof box, triple-gang
  - after: Single-gang box · Single-gang metal box · Single-gang box extender · Single-gang box, deep · Single-gang old-work box
- **"2 gang"**
  - before: 2-gang blank plate · 2-gang wall plate · 4" square mud ring, 2-gang · 1/2" FS cast box, 2-gang · 3/4" FS cast box, 2-gang
  - after: 2-gang blank plate · 2-gang wall plate · Double-gang box · Double-gang metal box · Double-gang box, deep
- **"2 gang box"**
  - before: 1/2" FS cast box, 2-gang · 3/4" FS cast box, 2-gang · Handy box · 1/2" weatherproof box, single-gang · 1/2" weatherproof box, double-gang
  - after: Double-gang box · Double-gang metal box · Double-gang box, deep · Double-gang old-work box · 1/2" FS cast box, 2-gang
- **"3 gang"**
  - before: 3-gang blank plate · 3-gang wall plate · 3/4" weatherproof box, single-gang · 3/4" FS cast box, 2-gang · 3/4" weatherproof box, double-gang
  - after: 3-gang blank plate · 3-gang wall plate · Triple-gang box · Triple-gang metal box · Triple-gang old-work box
- **"3 gang box"**
  - before: 3/4" weatherproof box, single-gang · 3/4" FS cast box, 2-gang · 3/4" weatherproof box, double-gang · 3/4" weatherproof box, single-gang, PVC · 3/4" FD cast box
  - after: Triple-gang box · Triple-gang metal box · Triple-gang old-work box · Masonry box, triple-gang · 1/2" weatherproof box, triple-gang
- **"4 gang"**
  - before: 4-gang box · 4-gang blank plate · 4-gang wall plate · 4" square mud ring, 2-gang · 4-11/16" square mud ring, 2-gang
  - after: 4-gang box · 4-gang blank plate · 4-gang wall plate
- **"4 gang box"**
  - before: 4-gang box · 3/4" weatherproof box, single-gang · 3/4" FS cast box, 2-gang · 3/4" weatherproof box, double-gang · 3/4" weatherproof box, single-gang, PVC
  - after: 4-gang box
- **"5 gang"**
  - before: 5-gang box · 5-gang wall plate · 1/2" weatherproof box, single-gang · 3/4" weatherproof box, single-gang · 1/2" weatherproof box, double-gang
  - after: 5-gang box · 5-gang wall plate
- **"5 gang box"**
  - before: 5-gang box · 1/2" weatherproof box, single-gang · 3/4" weatherproof box, single-gang · 1/2" weatherproof box, double-gang · 3/4" weatherproof box, double-gang
  - after: 5-gang box
- **"2 gang plate"**
  - before: 2-gang blank plate · 2-gang wall plate · Duplex/toggle combo plate · Weatherproof blank cover, double-gang
  - after: 2-gang blank plate · 2-gang wall plate · Weatherproof blank cover, double-gang · Duplex/toggle combo plate
- **"3 gang plate"**
  - before: 3-gang blank plate · 3-gang wall plate · Single-gang box extender
  - after: 3-gang blank plate · 3-gang wall plate
- **"1 pole"**
  - before: 12 ft light pole · Tele-power pole, 10 ft · Tele-power pole, 15 ft · 15A Single-Pole breaker · 100A 2-Pole breaker
  - after: Single-pole switch · 15A Single-Pole breaker · 20A Single-Pole breaker · 30A Single-Pole breaker · 15A Single-Pole AFCI breaker
- **"1 pole breaker"**
  - before: 15A Single-Pole breaker · 100A 2-Pole breaker · 110A 2-Pole breaker · 125A 2-Pole breaker · 15A Single-Pole AFCI breaker
  - after: 15A Single-Pole breaker · 20A Single-Pole breaker · 30A Single-Pole breaker · 15A Single-Pole AFCI breaker · 20A Single-Pole AFCI breaker
- **"2 pole"**
  - before: 20 ft light pole · 20A Single-Pole breaker · 20A 2-Pole breaker · 20A Single-Pole AFCI breaker · 20A Single-Pole GFCI breaker
  - after: 20A 2-Pole breaker · 30A 2-Pole breaker · 40A 2-Pole breaker · 50A 2-Pole breaker · 60A 2-Pole breaker
- **"2 pole breaker"**
  - before: 20A Single-Pole breaker · 20A 2-Pole breaker · 20A Single-Pole AFCI breaker · 20A Single-Pole GFCI breaker · 20A Single-Pole AFCI/GFCI combo breaker
  - after: 20A 2-Pole breaker · 30A 2-Pole breaker · 40A 2-Pole breaker · 50A 2-Pole breaker · 60A 2-Pole breaker
- **"3 pole"**
  - before: 30 ft light pole · 30A 2-Pole breaker · 30A Single-Pole breaker · 30A double-pole switch · 30A 2-Pole half-size breaker
  - after: 15A 3-Pole breaker · 20A 3-Pole breaker · 25A 3-Pole breaker · 30A 3-Pole breaker · 35A 3-Pole breaker
- **"3 pole breaker"**
  - before: 30A 2-Pole breaker · 30A Single-Pole breaker · 30A 2-Pole half-size breaker · 30A Single-Pole half-size breaker · 35A Single-Pole breaker
  - after: 15A 3-Pole breaker · 20A 3-Pole breaker · 25A 3-Pole breaker · 30A 3-Pole breaker · 35A 3-Pole breaker
- **"2 pole 20"**
  - before: 20 ft light pole · 20A Single-Pole breaker · 20A 2-Pole breaker · 20A Single-Pole AFCI breaker · 20A Single-Pole GFCI breaker
  - after: 20A 2-Pole breaker · 20A 2-Pole half-size breaker · 20A 2-Pole quad breaker · 20A 2-Pole AFCI breaker · 20A 2-Pole GFCI breaker
- **"2 pole 30"**
  - before: 30A 2-Pole breaker · 30A 2-Pole half-size breaker · 30A 2-Pole AFCI breaker · 30A 2-Pole GFCI breaker · 30A 2-Pole AFCI/GFCI combo breaker
  - after: 30A 2-Pole breaker · 30A double-pole switch · 30A 2-Pole half-size breaker · 30A 2-Pole AFCI breaker · 30A 2-Pole GFCI breaker
- **"3 way"**
  - before: 3-way switch · 3-way dimmer · 20A 3-way switch · Coax splitter · 4-way switch
  - after: 3-way switch · 3-way dimmer · 20A 3-way switch · Strut wing connector
- **"3 way switch"**
  - before: 3-way switch · 20A 3-way switch · 4-way switch · 20A 4-way switch
  - after: 3-way switch · 20A 3-way switch
- **"4 way"**
  - before: 4-way switch · 20A 4-way switch · Coax splitter · 4x4 wireway
  - after: 4-way switch · 20A 4-way switch
- **"1 hole"**
  - before: 1/2" EMT one-hole strap · 1" EMT one-hole strap · 1-1/4" EMT one-hole strap · 1-1/2" EMT one-hole strap · 1/2" PVC one-hole strap
  - after: 1/2" EMT one-hole strap · 3/4" EMT one-hole strap · 1" EMT one-hole strap · 1-1/4" EMT one-hole strap · 1-1/2" EMT one-hole strap
- **"1 hole strap"**
  - before: 1/2" EMT one-hole strap · 1" EMT one-hole strap · 1-1/4" EMT one-hole strap · 1-1/2" EMT one-hole strap · 1/2" PVC one-hole strap
  - after: 1/2" EMT one-hole strap · 3/4" EMT one-hole strap · 1" EMT one-hole strap · 1-1/4" EMT one-hole strap · 1-1/2" EMT one-hole strap
- **"2 hole"**
  - before: 2" EMT one-hole strap · 2-1/2" EMT one-hole strap · 2" PVC one-hole strap · 2-1/2" PVC one-hole strap · 2" rigid one-hole strap
  - after: EMT strap
- **"2 hole strap"**
  - before: 2" EMT one-hole strap · 2-1/2" EMT one-hole strap · 2" PVC one-hole strap · 2-1/2" PVC one-hole strap · 2" rigid one-hole strap
  - after: EMT strap
- **"3 hole"**
  - before: 3/4" EMT one-hole strap · 3" EMT one-hole strap · 3/4" PVC one-hole strap · 3" PVC one-hole strap · 3/4" rigid one-hole strap
  - after: 1/2" weatherproof box, single-gang · 3/4" weatherproof box, single-gang · 1/2" weatherproof box, double-gang · 3/4" weatherproof box, double-gang · 1/2" weatherproof box, triple-gang
- **"3 hole strap"**
  - before: 3/4" EMT one-hole strap · 3" EMT one-hole strap · 3/4" PVC one-hole strap · 3" PVC one-hole strap · 3/4" rigid one-hole strap
  - after: (nothing)
- **"5 hole"**
  - before: 500 kcmil crimp lug, single size · 1/2" weatherproof box, single-gang · 3/4" weatherproof box, single-gang · 1/2" weatherproof box, double-gang · 3/4" weatherproof box, double-gang
  - after: 1/2" weatherproof box, single-gang · 3/4" weatherproof box, single-gang · 1/2" weatherproof box, double-gang · 3/4" weatherproof box, double-gang · 1/2" weatherproof box, triple-gang
- **"5 hole strap"**
  - before: 500 kcmil crimp lug, single size · 250-350 kcmil crimp lug
  - after: (nothing)
- **"3 hole box"**
  - before: 3/4" weatherproof box, single-gang · 3/4" weatherproof box, double-gang · 3/4" weatherproof round box · 3/4" threaded closure · 1/2" weatherproof box, single-gang
  - after: 1/2" weatherproof box, single-gang · 3/4" weatherproof box, single-gang · 1/2" weatherproof box, double-gang · 3/4" weatherproof box, double-gang · 1/2" weatherproof box, triple-gang
- **"2 head"**
  - before: LED security light, motion-activated, 2-head · 2" metal weatherhead · 2-1/2" metal weatherhead · 2" PVC weatherhead · 2-1/2" PVC weatherhead
  - after: LED security light, motion-activated, 2-head
- **"2 light"**
  - before: 20 ft light pole · 24" under-cabinet light bar · LED security light, motion-activated, 2-head · Vanity light, 2-light · 2 ft LED strip fixture
  - after: Vanity light, 2-light
- **"3 light"**
  - before: 30 ft light pole · 36" under-cabinet light bar · LED security light, motion-activated, 3-head · Vanity light, 3-light · 3/4" weatherproof round box
  - after: Vanity light, 3-light
- **"20 space"**
  - before: 200A main panel, 30-space · 200A main panel, 40-space · 200A main panel, 42-space · 200A main-lug sub-panel, 30-space · 200A main-lug sub-panel, 40-space
  - after: 100A main panel, 20-space · 125A main panel, 20-space · 100A main-lug sub-panel, 20-space · 125A main-lug sub-panel, 20-space
- **"40 space"**
  - before: 400A main panel, 42-space · 400A main-lug sub-panel, 42-space · 150A main panel, 40-space · 200A main panel, 40-space · 150A main-lug sub-panel, 40-space
  - after: 150A main panel, 40-space · 200A main panel, 40-space · 150A main-lug sub-panel, 40-space · 200A main-lug sub-panel, 40-space
- **"20 space panel"**
  - before: 200A main panel, 30-space · 200A main panel, 40-space · 200A main panel, 42-space · 100A main panel, 20-space · 125A main panel, 20-space
  - after: 100A main panel, 20-space · 125A main panel, 20-space · 100A main-lug sub-panel, 20-space · 125A main-lug sub-panel, 20-space
- **"2 circuit"**
  - before: 20A Single-Pole breaker · 20A 2-Pole breaker · 20A Single-Pole AFCI breaker · 20A Single-Pole GFCI breaker · 20A Single-Pole AFCI/GFCI combo breaker
  - after: 15/15 tandem breaker · 20/20 tandem breaker · 15/20 tandem breaker · 30/30 tandem breaker · 15A 2-Pole quad breaker
- **"4 circuit"**
  - before: 40A 2-Pole breaker · 40A 2-Pole half-size breaker · 40A Single-Pole breaker · 45A Single-Pole breaker · 45A 2-Pole breaker
  - after: (nothing)

### S2. `5/6" wafer LED downlight` (the old spelling) finds nothing

Same area, lower risk, already in todo. The rename map knows the old name
(`shared/renamedMaterials.ts:39`), and ranking treats a former name as exact
(`phraseTier`), but the MATCHER runs first and requires every term to match:
`5/6"` is read as a size in inches, no row has that size, so nothing reaches
the ranker. **Plan:** check `renamedTo(query)` before term matching and, on a
hit, return the renamed row first. **Test:** the old spelling returns the
renamed row first; loop the whole rename map (the existing loop in
`materialSearchRank.test.ts` does this for ranking, not for matching).

---

## 3. Tests that leave rows behind

### What happened (2026-09-29)

The first full run on `bidrender_test_c` failed partway through
`server/takeoffBridgeFlow.test.ts` (missing columns). That file inserts
**shared** assemblies (`userId NULL` — every company sees them) and deletes
them at the END of the test body, so a failure left one behind:
`Fork flow starter R3 <time>`. The next run's `assemblies.test.ts` — which
runs before it, alphabetically — found a shipped assembly with no materials
and failed. `takeoffBridgeFlow`'s `beforeEach` deletes leftovers by name, but
only when that file starts, after the damage.

### Measured after a CLEAN full run (4,056 passed), `bidrender_test_c`

- **Shared rows: none leaked.** 1,520 materials = the catalog; 8 assemblies,
  3 kits, 5 labor rates, 5 modifiers = the seeders' lists.
- **User-owned rows: a lot.** 121 users, 4,242 bids (40 owners), 480 owned
  materials, 219 owned assemblies, 111 company memberships, and smaller
  counts in 20 other tables. None crosses files today — fixture ids are
  distinct — but every one is a row a test left for somebody else.

Only two test files write `userId: null` literally (`takeoffBridgeFlow`,
`materialsLibrary` — the second is a pure-function fixture, no database). A
grep is not enough, though: an insert that omits `userId` also writes NULL.

> **BUILT 2026-09-29 — T1, T2, and T3 in report mode.** Full suite with the
> guard live: **205 files, 4,165 passed, 0 failed; no file leaves a shared
> row.**
>
> - **T1:** `dropSharedAssemblyWhenDone` registers the delete with
>   `onTestFinished` right after each insert. Forced check: the R3 test made
>   to throw after its insert left **0** shared rows; with the registration
>   removed, the same run left `Fork flow starter R3 …` — the leak exactly.
> - **T2:** `scripts/testLeakGuard.ts` + hooks in `vitest.setup.ts`. On that
>   forced leak it failed the FILE: "server\takeoffBridgeFlow.test.ts left 1
>   SHARED row(s) behind … assemblies #1810 "Fork flow starter R3 …"". Hook
>   order confirmed, not assumed: `seedReactivatesRetired`'s non-shipped
>   fixture row, removed in its own `afterAll`, passes — the guard runs after.
> - **T3 (report only, `TEST_LEAK_REPORT=<file>`):** per run, **20 of 205
>   files leave 195 user-owned rows** — materials 93, assemblies 41,
>   takeoff_run_types 37, then 1–3 each of bids, users, company_members and
>   others. The worst: `materialsList.test.ts` 38, `proposal.test.ts` 18,
>   `linePricingProblems.test.ts` 18, `assemblyOverhead.test.ts` 16,
>   `extrasLaborSplit.test.ts` 13. The 4,242 bids measured earlier are
>   history: files that clean at the START of their next run net to zero;
>   these 20 grow every run. Fixing them is the separate change the owner
>   asked for (todo.md).

> **T3 FIXED 2026-09-29 (owner: fix every file).** `dropFixtureUsersAfterAll`
> (`server/testFixtureUsers.ts`) deletes a file's fixture users in `afterAll`,
> pass or fail. All 52 `userId` foreign keys cascade from `users`, so that is
> everything the file wrote. After the local-dev merge the leakers were 21
> files and 209 rows (three new files came with the merge). All 23 files
> named here or new are fixed. Full suite, 209 files, 4,211 passed: **0 rows
> left.** A second run of the 23 files: 0, with nothing left to clear. Forced
> failing test: 0 rows with the call, 46 without. No app code changed, and no
> file was skipped.

#### T3-measured: files that left user-owned rows, one full run

| File                                        | Rows | By table                                                                                                                                                                                 |
| ------------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| server/materialsList.test.ts                | 38   | materials 19, assemblies 14, takeoff_run_types 5                                                                                                                                         |
| server/proposal.test.ts                     | 18   | materials 18                                                                                                                                                                             |
| server/linePricingProblems.test.ts          | 18   | assemblies 9, materials 9                                                                                                                                                                |
| server/assemblyOverhead.test.ts             | 16   | materials 16                                                                                                                                                                             |
| server/extrasLaborSplit.test.ts             | 13   | materials 3, bid_pdf_sheets 1, bid_pdfs 1, bids 1, company_members 1, pricing_defaults 1, takeoff_extra_defaults 1, takeoff_run_circuits 1, takeoff_run_types 1, takeoff_runs 1, users 1 |
| server/takeoffRuns.test.ts                  | 12   | takeoff_run_types 12                                                                                                                                                                     |
| server/accountingExport.test.ts             | 12   | assemblies 6, materials 6                                                                                                                                                                |
| server/takeoffExport.test.ts                | 12   | takeoff_run_types 12                                                                                                                                                                     |
| server/materialMarkupAgreement.test.ts      | 11   | assemblies 11                                                                                                                                                                            |
| server/groupDropsBid.test.ts                | 9    | bid_pdf_sheets 1, bid_pdfs 1, bids 1, company_members 1, pricing_defaults 1, takeoff_groups 1, takeoff_height_defaults 1, takeoff_stamps 1, users 1                                      |
| server/takeoffRunTypes.test.ts              | 8    | materials 8                                                                                                                                                                              |
| server/companyDefaults.test.ts              | 8    | materials 8                                                                                                                                                                              |
| server/typedLengthRuns.test.ts              | 8    | takeoff_run_types 6, company_members 1, users 1                                                                                                                                          |
| server/permissions.test.ts                  | 3    | materials 2, clients 1                                                                                                                                                                   |
| server/assemblies.test.ts                   | 3    | materials 3                                                                                                                                                                              |
| server/closeout.test.ts                     | 2    | bid_closeouts 1, bids 1                                                                                                                                                                  |
| server/bids.test.ts                         | 1    | materials 1                                                                                                                                                                              |
| server/takeoffStamps.test.ts                | 1    | assemblies 1                                                                                                                                                                             |
| server/laborRateSharing.test.ts             | 1    | kits 1                                                                                                                                                                                   |
| server/quantitiesIgnoreDeletedPlans.test.ts | 1    | takeoff_run_types 1                                                                                                                                                                      |

### T1. Fix the file that did it

`takeoffBridgeFlow.test.ts`: register the delete with `onTestFinished` right
after each shared insert (runs on failure too), and keep the by-name clean in
`beforeEach` as the second net. **Test that fails without it:** make the test
throw after the insert on purpose (locally, not committed) and read the table
— the row must be gone. Recorded in the commit, as the backup race was.

### T2. A guard that fails the file that leaks — the forcing function

In `vitest.setup.ts` (runs inside every file): `beforeAll` records the ids of
shared rows in the library tables (`materials`, `assemblies`, `kits`,
`labor_rates`, `modifiers`, `takeoff_run_types`); `afterAll` fails the FILE if
any shared row exists that was not there before AND whose name is not in the
shipped seed lists (seeders legitimately add shipped rows on a fresh
database). The failure names table, id and name. The comparison is a pure
function in `scripts/` so vitest can reach it.

- **To confirm first, not assumed:** that a setup-file `afterAll` runs AFTER
  the file's own `afterAll` (vitest's hook order), or the guard would fire on
  rows a file is about to clean. `seedReactivatesRetired` is the test case:
  its shipped fixture row is removed in its own `afterAll`.
- **Test that fails without it:** the pure function flags a new shared row
  not in the shipped lists, ignores a shipped one and a pre-existing one.

### T3. User-owned leftovers — measure per file, then decide

Same guard, second half, in REPORT mode first: every `users` row created
during a file must be gone by its `afterAll` (a user delete cascades to
everything scoped to it). Run the suite once, list the files that leave users,
fix them file by file, then switch the guard from report to fail.

**Question Q5:** this batch does shared rows (T1, T2) and only MEASURES
user-owned ones (T3 report mode), or does it also fix every file? Recommend
the first: T3's fix touches roughly 40 files, and reads better as its own
change once the list is known.

---

## 4. Handoffs for Track A (schema)

| #   | Migration                                                                                   | Kind                                                                   | Unblocks |
| --- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | -------- |
| A1  | Append `locknut`, `bushing` to `bid_line_items.runMaterialRole` (like 0084/0085, no UPDATE) | ADDITIVE — apply BEFORE the code (CLAUDE.md § "Deploying a migration") | W5       |

**Possibly also, depending on the owner's answers to the Q3 findings (W5):**

- **A2 — only if a company's OWN connector must be able to say "includes a
  locknut / insulated throat".** Two nullable booleans on `materials`
  (`includesLocknut`, `insulatedThroat`; NULL = not stated, counted as not
  included), additive. The alternative needs no schema: a flag on the SEED
  rows, which a fork reads through its `baselineId` — enough for every
  shipped connector, not for one a company typed from scratch.
- **A3 — only if "skip at a threaded hub" must apply at run ends.** A
  nullable per-end answer on `takeoff_runs` (what box the end lands in),
  additive. Without it the hub skip applies at LB bodies only.

Already waiting on A from earlier work, unchanged: `teeBody` on the same enum
(`todo.md`, "T bodies at a tee").

Nothing else in this batch needs a schema change: W1–W4, S1, S2 and T1–T3 are
code and tests only.

---

## 5. Questions for the owner (recommended answer first)

- **Q1.** Sweep caption: name the part the run type buys ("90° sweep" /
  "90° elbow"), or "bend" everywhere? _Recommend the part._
- **Q2.** A cable tee's box: `4" square box, 2-1/8" deep` + blank cover for
  every cable type? _Recommend yes._
- **Q3.** Bushings: every rigid/IMC end, and other families from 1-1/4" up?
  Locknuts: one per threaded connector end? _Recommend yes to both._ (Built
  after A1.)
- **Q4.** Search: a count number never matches a size (fixes "3 hole",
  "2 gang box", "2 pole 20")? _Recommend yes_, with the before/after count
  sweep as the gate.
- **Q5.** Tests: shared-row guard now, user-owned leftovers measured only?
  _Recommend yes._

## 6. Order of work once answered

1. S1 before anything else — it is a regression this track shipped.
2. W2, W3 (tooling that runs against production).
3. W1, W4.
4. T1, T2, then T3 in report mode.
5. S2.
6. W5 after A1 lands.

Each: `pnpm check`, the suite on `bidrender_test_c`, commit and push to
`track-c`. No merge until told.
