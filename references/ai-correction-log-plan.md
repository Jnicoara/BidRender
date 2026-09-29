# AI correction log — record every correction to an AI-made mark. PLAN ONLY, 2026-09-29

**Status: nothing here is built.** This is the detailed plan for piece 3 of
`references/stage-4-safety-plan.md`, measured against `local-dev` at
`977b789`.

**Why now.** The log cannot be backfilled. A correction that happens before the
table exists is gone. The plan reader (`takeoff.copilot`) is available to
**everyone** today (`shared/permissions.ts:212`). Nothing but
`DISABLE_AI_FEATURES` holds it back. So the first outside user who opens a
sheet can make the first correction we will never see. **This must ship before
any outside user is invited** (`references/invite-gate-plan.md`).

**Read first — the decisions this follows, cited rather than re-opened:**

- **stage-4 § "Shape of each code piece" 3.** One table, written **after** the
  edit commits, inside its own try/catch that logs and swallows the error.
  **Nothing reads it.** Each row has an identified half and an anonymised half.
  Foreign keys are `set null`, not cascade.
- **stage-4 owner answer 4 (2026-09-27).** Keep the picture, not just the
  label: a small **cut-out image of the symbol, stored in R2**. Anything
  identifying the company, job or customer is stripped from the half that would
  be shared. This overrode stage-4's own "kind, not picture" line.
- **stage-4 owner answer 7 / `todo.md` § Pending.** A terms page must exist
  before **any** sharing, pooling or export, including the anonymised half.
  Writing the log is not blocked; the **first read** is.
- **The `ai_usage_daily` precedent** (`server/llm/index.ts:152-167`). It writes
  after the call, in its own try/catch that only warns, so a failure costs
  data, never the user's work.
- **This overrides one older line, and says so in both files.**
  `plan-viewer-overhaul.md` § 9.5 says accept/reject measurement stores
  "outcome and tier only, no crops, no labels". Owner answer 4 replaced that
  for the correction log. A note has been added at § 9.5 on this branch.

## The owner's answers (2026-09-29) — these override anything below

**Q1–Q7 in § 11 are all answered as recommended**, and Q5 now has an owner and
a deadline:

1. **Log accepts too** (`accepted`).
2. **Deleting a bid keeps the anonymised half and its cut-out**, with the
   identity columns nulled. **This answer DEPENDS ON Q5.** It is only
   acceptable once the terms say so plainly. Until the terms sentence exists,
   treat Q2 as provisional. If the terms end up saying otherwise, § 4's
   `set null` becomes a delete of the whole row and its crop, and that has to
   be decided **before** the first outside user makes a correction, because
   rows written under one promise cannot be re-promised.
3. **Deleting a whole count logs one row per AI mark**, as `deleted_with_group`.
4. **The shared half keeps the label, cut to 40 characters.**
5. **The owner writes the terms sentence before the first outside invite.**
   So the order is: terms sentence, then first outside invite. This log must
   also be live by then ("Why now"). `invite-gate-plan.md` § 8.9 carries the
   same condition.
6. **Location tags are logged**, as `location_set`.
7. **The group fault was real and is fixed**, on branch `a-ai-marks` (§ 1),
   which merges into `local-dev` before this log is built.

---

## 1. What an "AI-made mark" is today (measured)

It matters because the log can only record what the code can recognise as
AI-made.

- **The AI never writes a mark by itself.** `planCopilot.read` stores
  _findings_ (`plan_copilot_findings`): a legend label, an x/y **point** in
  page points, a confidence tier (`high|low|unreadable`) with a 0–1 score, a
  reason and a note. There is **no bounding box**, only a point. The model never
  names an assembly; the user's own `symbol_links` do (`buildFindings`,
  `shared/copilotDetection.ts`).
- **A mark becomes real when the user presses Place.** `planCopilot.confirm`
  writes ordinary `takeoff_stamps` rows and sets `finding.stampId`.
- **`takeoff_stamps` has no provenance column.** The only way to know a stamp
  was AI-made is that a finding points at it. When the stamp is deleted,
  `finding.stampId` goes NULL (`set null`), and the fact is lost. **Nothing
  today records that deletion** (stage-4 § "What already exists", row 3).
- **`takeoff_runs.isSuggestion`** exists, but nothing creates AI runs.
- **Found while planning, not caused by this: a placed AI mark is written with
  `groupId` NULL** (`planCopilotRouter.ts:925-940`). Both stamp counters skip
  a NULL group (`db.ts:5147`, `db.ts:8613`). **By the code, a placed AI mark is
  drawn on the sheet but counted on no bid line.** It also changes this plan,
  because once AI marks have groups, deleting a **group** deletes AI marks too
  (§ 2).

  > **Measured 2026-09-29, and real.** On the local fixture bid, one hand mark
  > plus one placed AI mark of the same assembly read **bid line 1, materials
  > list 2**, and the sheet showed the assembly as two counts of 1. It is fixed
  > on `a-ai-marks` (`2ca2def`): Place now finds or makes the assembly's count
  > through the same function as the stamp tool (`server/assemblyGroup.ts`).
  > **No repair is needed.** Live, counted read-only the same day, has 0 placed
  > AI marks outside a count, 0 confirmed findings and 0 plan-reader runs ever.
  > The local copy also has 0.

---

## 2. What gets logged — every event

"Edits or deletes an AI-made mark", mapped onto every path that exists today.
The list comes from reading every mutation in `takeoffStampsRouter`,
`takeoffGroupsRouter`, `takeoffRunsRouter` and `planCopilotRouter`.

| Event (`action`)      | Path                                                                | "What the AI said"                                     | "What the user changed it to"                                                                     |
| --------------------- | ------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `dismissed`           | `planCopilot.dismiss` — a proposal rejected before it became a mark | label, point, tier, score, the assembly it resolved to | nothing — "not this / not here"                                                                   |
| `relabelled`          | `planCopilot.correct` — "this label is really that symbol"          | label, resolved symbol and assembly                    | the symbol link and assembly the user chose                                                       |
| `deleted`             | `takeoffStamps.remove` on a stamp a finding points at               | the finding                                            | nothing — "should not exist"                                                                      |
| `location_set`        | `takeoffStamps.setLocation` / `setLocationForGroup` on such a stamp | the finding (the AI said no location)                  | the location                                                                                      |
| `deleted_with_group`  | `takeoffGroups.remove`, **only once AI marks have groups** (§ 1)    | each finding                                           | nothing, but see Q3 — this is often "wrong count" rather than "wrong mark"                        |
| `accepted` (Q1)       | `planCopilot.confirm`                                               | the finding                                            | the stamp id — "right"                                                                            |
| Runs (`isSuggestion`) | `takeoffRuns.acceptSuggestion`, `remove`, …                         | —                                                      | **Not built.** Hook when something creates AI runs. A test (§ 7) makes that impossible to forget. |

**Not logged, on purpose:** deleting a plan set, a bid (by hand or by the
nightly purge) or a user. Those are not corrections. Cascades remove the stamps
and findings, and the log rows survive with their identity columns nulled
(§ 4).

**There is no "moved" and no "re-tagged to another assembly" event**, because
neither exists for stamps today. Takeoff-spec **D6** plans move-by-drag and
undo. **When either is built, it logs here.** The guard test in § 7 is what
makes that true.

---

## 3. How it is written — never in the way of the edit

The user asked for this and stage-4 decided it: **a logging failure must never
block, slow or fail the edit.** The shape:

```
1. read context   — the finding for this stamp (and its run, for the model)
                    wrapped: on failure, log nothing and carry on
2. THE EDIT       — unchanged; its errors are the user's errors, as today
3. write the log  — after step 2 returned; NOT awaited by the response;
                    void logAiCorrection(...).catch(warn)
```

- **Step 1 exists because a delete destroys the evidence.** After step 2,
  `finding.stampId` is already NULL. The read happens first, is wrapped, and
  its failure means "no log row", never "no delete".
- **Step 3 is fire-and-forget** rather than an awaited try/catch, so a slow log
  insert adds nothing to the edit's round trip. Its failure goes to
  `console.warn` with the action and ids, **never** with label text, the same
  as `ai_usage_daily`.
- **One door: `server/aiCorrections.ts`**, the single function every call site
  uses, the same idea as `server/llm` and `server/email`. It owns the
  anonymising (§ 4) so no call site can forget to strip something.
- **Not in the edit's transaction.** Putting the log inside it would let a
  logging fault roll back the user's work, which is the one outcome that is
  forbidden.
- **The client is not involved in the row.** A server write cannot be skipped
  by an old tab or a crashed page. Only the cut-out image needs the client
  (§ 5), and the row is complete without it.

---

## 4. The table — two halves

**Identified half** (for our own debugging; never shared):

| Column                                | Notes                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `dataUserId`                          | The company (owner id). FK `users`, **ON DELETE SET NULL**.                                          |
| `actorUserId`                         | Who made the edit. FK `users`, SET NULL.                                                             |
| `bidId`                               | FK `bids`, SET NULL. Deleting a bid strips the identity and keeps the anonymised half.               |
| `sheetId`                             | FK `bid_pdf_sheets`, SET NULL.                                                                       |
| `findingId`                           | FK `plan_copilot_findings`, SET NULL.                                                                |
| `stampId`                             | **A plain int, no FK.** On a delete the stamp is already gone, so an FK would null it at once.       |
| `aiLabel`                             | `rawLabel` exactly as the AI read it. This is identified, because a legend label can name a project. |
| `aiAssemblyName` / `userAssemblyName` | The company's own names. Identified, because names can carry a customer.                             |
| `x`, `y`                              | Page points, from the finding.                                                                       |
| `userValue`                           | JSON: what it was changed to (location, symbolLinkId, assemblyId).                                   |
| `createdAt`                           | Exact time.                                                                                          |

**Anonymised half** (the only columns sharing would ever read; § 6):

| Column                                          | Notes                                                                                                                                                             |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shareId`                                       | A random id (for example 16 bytes, base64url), **not derivable** from any other id. What a shared row is called.                                                  |
| `action`                                        | § 2's list.                                                                                                                                                       |
| `model`                                         | From `plan_copilot_runs.model`.                                                                                                                                   |
| `tier`, `score`                                 | The AI's confidence.                                                                                                                                              |
| `labelNormalised`                               | `rawLabel` lowercased and whitespace-folded, **and truncated to a short length** (Q4).                                                                            |
| `aiKind`, `userKind`                            | The **category**, not the name: `assemblyCategory` for the AI's resolved assembly and for the user's choice. Plus `trade`. Company names never enter this half.   |
| `sheetDiscipline`                               | The sheet number's letter prefix only (`E`, `P`, `M`), from `bid_pdf_sheet_identity`. It tells an electrical legend from a plumbing one without naming the sheet. |
| `month`                                         | `YYYY-MM`, not a timestamp. Exact times across rows can re-identify a company.                                                                                    |
| `cropKey`                                       | The R2 key of the cut-out (§ 5), NULL until it arrives.                                                                                                           |
| `cropStatus`                                    | `pending` / `stored` / `unavailable` / `failed`. A missing picture must say **why**, never just be absent.                                                        |
| `cropWidth`, `cropHeight`, `cropPointsPerPixel` | So a later reader knows the scale the symbol was captured at.                                                                                                     |

Indexes: `(dataUserId, createdAt)` for our own debugging later, and
`shareId` UNIQUE. Nothing else, because nothing reads it yet.

---

## 5. The symbol cut-out image

**What it is.** A small PNG of the drawing around the AI's point: the symbol the
AI read, as the estimator saw it. Owner answer 4 says this is what makes shared
symbol learning possible later, because a label alone does not teach anything
about what a symbol looks like.

**The catch, measured.** The AI returns a **point, not a box**. The server
**never has the rendered page**: the plan reader's snapshot is sent inline to
the model and not stored (`client/src/lib/planSnapshot.ts`,
`MAX_IMAGE_CHARS`). `symbol_links` stores a 96px thumbnail and no box size
(`schema.ts:3613`). So the picture has to be cut **in the browser**, from the
page it has already drawn. That is the same thing legend capture already does
(`cropToThumbnail`, `SymbolCapture.tsx:44-72`).

**How:**

1. The server mints the row's `shareId` **before** the fire-and-forget insert,
   and the edit returns it as `correctionId` beside what it returns today. That
   is additive, and any caller that does not know about it ignores it. The
   edit does not wait on the insert. If the insert later fails, `attachCrop`
   finds no row and stores nothing: a crop without a row is never written, so
   it can never become an orphan.
2. The client cuts a **fixed window centred on the finding's point** from the
   rendered page canvas, reusing `cropToThumbnail`. The size is in **page
   points**, so it covers the same patch of paper at every zoom. **The number
   is to be measured, not asserted** (CLAUDE.md): take five real symbols on
   the fixture bid's E-sheets and pick the smallest window that holds each whole
   symbol with a margin. Record the measurement next to the constant, the way
   `shared/takeoffMarks.ts` does.
3. Then, **separately and fire-and-forget**, it calls
   `aiCorrections.attachCrop(correctionId, png)`. The server stores it through
   `server/storage.ts` under `ai-corrections/<shareId>.png` and sets
   `cropKey` and `cropStatus`. Size cap: the same 200 KB check
   `captureSymbol` uses.
4. **If the page is not rendered** (the delete came from a list, the sheet is
   scrolled away, or the tab closed), `cropStatus` becomes `unavailable`,
   stated rather than absent. Recording a _dismissed_ proposal is the common
   case, and it happens on the sheet, so most rows get a picture.

**Why not cut it on the server at read time?** It would work: the server holds
the snapshot for the length of `read`. It would be a better picture too,
because it is exactly what the AI saw. But it needs a server image library
(none is installed; `sharp` is native and is one more thing that can break the
App Platform build). It would also store a crop for **every** finding, most of
which are never corrected. Recommendation: **the client cut now.** Revisit if
the `unavailable` share turns out to be high. That share is a number the table
will hold.

**Storage — three rules that are not optional:**

- **Add `ai_correction_log.cropKey` to `FILE_SOURCES`**
  (`server/backup/collectFiles.ts:37`). **This is the one that deletes data if
  missed.** `scripts/sweepOrphanPlans.mts` treats every stored object that no
  column names as an orphan and deletes it after 7 days
  (`ORPHAN_MIN_AGE_DAYS`). Every crop would quietly disappear a week after it
  was taken, and the rows would still say `stored`. The backup reads the same
  list, so the crops would also never be backed up.
- **The plans bucket, under its own prefix**, through `storage.ts` (disk
  locally, R2 live). A crop is never served to a browser, because nothing reads
  it, so no signed URL is ever minted for one.
- **A crop is a piece of somebody's drawing.** Keep it tight around the symbol,
  so a room name or address is less likely to fall inside it. It is still
  treated as needing the terms page before it is ever shared (§ 6).

---

## 6. Not reading it yet

- **No router query, no screen, no admin panel, no export.** The only code that
  touches the table is `server/aiCorrections.ts`, and it only writes.
- **A test asserts it** (§ 7), so a "quick admin count" cannot slip in before
  the terms page.
- The DB dump in the nightly backup includes it, like every table. That is
  storage, not sharing.
- **When sharing is turned on later** (after the terms page), it is a `SELECT`
  of the anonymised columns plus the crops by `cropKey`. No rebuild, which is
  the whole point of splitting the halves now.

---

## 7. What is needed (build list)

1. **Migration** (§ 9).
2. **`server/aiCorrections.ts`**: `logAiCorrection(event)` (anonymises and
   writes, never throws to its caller), `readCorrectionContext(stampId)`
   (wrapped) and `attachCrop`.
3. **Call sites:** `planCopilot.dismiss`, `correct`, `confirm` (if Q1),
   `takeoffStamps.remove`, `setLocation`, `setLocationForGroup`, and
   `takeoffGroups.remove` once AI marks have groups.
4. **`aiCorrections.attachCrop(shareId, png)`**: a `companyProcedure` mutation
   that checks the correction row belongs to this company before storing. It is
   write-only and returns nothing from the row, so it is not a read (§ 6).
5. **Client:** after each of those mutations resolves with a `correctionId`,
   cut and send the crop without awaiting it. No spinner and no toast: the user
   did an edit, and the log is invisible to them.
6. **`FILE_SOURCES` entry** (§ 5).

**Tests** (server suite):

- **A logging failure never blocks the edit.** Make the log insert throw (a
  fake db), call `takeoffStamps.remove`, and assert the stamp is gone and the
  call succeeded. **This is the rule the whole plan exists for, so it gets a red
  to go to.**
- Each event in § 2 writes exactly one row with the right `action`. A stamp
  with no finding writes **none**, because a hand-placed mark is not an AI mark.
- The anonymised columns never contain the company's assembly name, the bid
  name or the sheet title. Seed those with a distinctive string and assert it
  appears in no anonymised column.
- Deleting the bid leaves the row, with the identity columns NULL and the
  anonymised half intact.
- **Nothing reads it:** a source scan (like `scopeDiscipline.test.ts`) fails if
  any file other than `server/aiCorrections.ts` and the migration names the
  table.
- **Guard for future paths:** a list of every stamp and run mutation, each
  marked "logs" or "not an AI correction, because …". A new procedure in those
  routers that is not on the list fails. This is how D6's move and undo, and AI
  runs, cannot be added without a decision.
- `FILE_SOURCES` contains the crop column. The sweep's refusal tests already
  exist, and this only adds the entry.

---

## 8. Risks, and what could break elsewhere

- **The orphan sweep deleting every crop** (§ 5). This is the only risk here
  that destroys data, and one list entry prevents it.
- **Latency on the edit.** The read in step 1 adds one indexed query to
  `remove` / `setLocation`. That is negligible, but measure a delete before and
  after on the fixture bid, not assume it.
- **The AI-mark group fault** (§ 1). If it is real and gets fixed, AI marks join
  groups and `takeoffGroups.remove` becomes a logging path. **Fix it first, or
  in the same change.** Otherwise the log's picture of "AI mark deleted"
  changes meaning halfway through its life, and rows from before and after the
  fix cannot be compared.
- **`finding.status` stays `confirmed` after its stamp is deleted** (today).
  The log is what records the deletion. **Do not also "fix" the finding's
  status in the same change.** That would change what the plan reader shows on
  a re-read, which is a behaviour change with its own reasons.
- **Storage growth.** At about 5–15 KB per PNG, 10,000 corrections is roughly
  100 MB. That is negligible on R2. It is stated so it is not assumed.
- **Privacy of the identified half.** It holds `aiLabel` and assembly names.
  They are no more sensitive than the findings table already holds, but this
  table **outlives the bid**. That is Q2.
- **Nothing here changes a price, a quantity, a bid total or an existing
  column.**

---

## 9. Migration

**One file, additive, step 1 (before the push). Step 3 is empty.** It creates
`ai_correction_log` with the § 4 columns. **Every column is nullable except
`id`, `action`, `shareId` and `createdAt`**, because a context read that failed
still writes a row with what it has. The number is whatever is next. If the
invite gate and reset land first it is **0099**. Check the directory when
writing it, and if it does not match, stop and find out why. **Hand-write it**;
do not trust `drizzle-kit generate` output.

**Deploy order:** apply the migration, then push. The code writes to a table
that must exist. Old code ignores the table, so the migration can go on live at
any time before the push.

---

## 10. Before the priced starter spreadsheet loads

**Nothing in this plan has to come before the spreadsheet, and the spreadsheet
does not affect it.** The log records symbols, labels and categories, never a
price, and the anonymised half deliberately carries no money. The ordering that
matters is a different one: **this must be live before outside users touch the
AI**, meaning before the first invite goes out.

The one pricing-related item that **does** block the spreadsheet is the
existing `todo.md` entry for a separate "nobody has priced this" signal. It is
repeated in `invite-gate-plan.md` § 10 because that is where strangers meet it.

---

## 11. Questions for the owner — ANSWERED 2026-09-29

All seven answered as recommended; see "The owner's answers" at the top. Q2
depends on Q5: it stands only once the terms sentence exists. Kept below as
asked.

1. **Q1. Log accepts too?** "Edited or deleted" is the ask. Without accepts
   there is nothing to divide by: 40 dismissals out of 50 proposals and 40 out
   of 5,000 are opposite stories. The findings table holds accepts today, but it
   cascades away with the bid. Recommendation: **yes, log `accepted`**. It is
   the same row, and it cannot be backfilled either.
2. **Q2. When a customer deletes a bid, does the anonymised half and its
   cut-out stay?** The plan says yes (set null), per stage-4. But a customer who
   deletes a job may reasonably expect a piece of that drawing to go too. The
   terms page (Q5) should say so either way. Recommendation: keep it, and have
   the terms say it plainly.
3. **Q3. Deleting a whole count that holds AI marks:** log it as one
   `deleted_with_group` row per mark, or one row for the group? One per mark
   keeps the pictures, but can flood the log with "I renamed my count and
   started over". Recommendation: **one per mark, marked with the group
   action**, so it can be filtered out later rather than lost now.
4. **Q4. The normalised label in the shared half.** Legend labels are usually
   generic ("DUPLEX RECEPT"), but an architect can write a project name into
   one. Truncate to 40 characters, or leave the label out of the shared half
   entirely and share only the category and picture? Recommendation: **keep a
   truncated label**, because the pairing of label and picture is most of the
   value.
5. **Q5. The terms page** is still open (`todo.md`). It does not block this
   build, but who writes the sentence, and when?
6. **Q6. Location tags.** The AI never proposes a location, so tagging one on
   an AI mark is not strictly "correcting the AI". It is logged in this plan
   because it is cheap and cannot be backfilled. Keep it, or drop it to keep the
   log about corrections only? Recommendation: **keep**, marked `location_set`.
7. **Q7. The group fault** (§ 1). OK to check it on the fixture bid and, if
   real, fix it as its own item ahead of this one?
