# Track B: three pieces before the beta

**Owner's answers (2026-09-27): all seven as recommended below.** Built in the
order branch-wiring check → 1 → 2 → 3, one commit each, on `track-b`. What
changed while building is recorded here, so the plan below is not read as a
description of the code.

| Piece                  | What differs from the plan below                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Branch-wiring check | **It was a wrong number, and was fixed first** (`7581ec4`). A conduit run answered "branch" lost its pipe, fittings and vertical pipe, which nothing else priced; D18 only ever moved the WIRE. Now only the wire is left out; a branch cable run is still left out whole. So piece 2's table row "branch → bid: no (not even conduit)" is now "wire no, conduit yes".                                                                                              |
| 1. Plan files          | As planned, plus: the sweep refused locally (49 of 58 orphaned — test-suite uploads), which showed a first production run could be blocked for good, so `--allow-majority` lifts the share refusal after the list has been read. The empty-database refusal cannot be lifted. `storageDelete` probed on the real plan bucket with a key of our own. The sweep has NOT been run against production.                                                                  |
| 2. Run totals          | As planned, as `shared/runOnBid.ts` (named for what it answers rather than `runBidStanding`), returning `footage` and `wire` separately, since a branch conduit run is now half on the bid. `leftOut.branch` has no feet: its pipe is IN the totals and its wire belongs to the devices. Test fixtures that traced untyped runs were given a type; no assertion about the arithmetic changed. The forcing test read 100 ft against the bid's 175 on the old router. |

**PLANNED 2026-09-27 on `track-b`. Nothing is built yet.** Every file:line
reference below was read on `track-b` at `c25bcc4`, with local-dev merged in.
The dev server was not run for this plan, so every number here comes from
reading the code or from a test. None was measured on a live screen.

This lane needs **no migration** and does not touch login, signup or email
(Track A) or the materials catalog seed (Track C).

**Schema verdict: none of the three pieces needs a schema change.** Two
optional extras would need one. They are listed under "For Track A" and neither
blocks anything here.

Suggested order: **1 → 2 → 3.** Piece 1 blocks the beta, because the files are
customer drawings. Piece 2 is a wrong-looking number on the screen whose whole
job is numbers. Piece 3 is discoverability.

---

## 1. Plan files left in storage after a bid is deleted

This is the open item at `todo.md:1323`.

### What exists

- **Every permanent delete is one `DELETE FROM bids`, and nothing touches storage.**
  - `db.deleteBidForever` (`server/db.ts:4431`) has three callers:
    - the nightly purge (`server/scheduled/purgeArchivedBids.ts:98`, 30 days after archiving);
    - `bids.deleteForever` (`bidsRouter.ts:702`);
    - `bids.deleteAllArchived` (`bidsRouter.ts:727`).
  - `bid_pdfs` and everything under it cascade away (`drizzle/schema.ts:2111`). The file behind `storageKey` stays in R2 or on disk.
- **Neither storage backend can delete.**
  - `server/storage.ts` exposes four operations: `storagePut`, `storagePresignPut`, `storageGet` and `storageGetSignedUrl`.
  - `r2Storage.ts` has no `DeleteObject`.
  - `diskStorage.ts` has no delete. Its only `unlink` (:148) cleans up a failed write.
- **Four stale comments blame Manus**, which is long gone:
  - `purgeArchivedBids.ts:79-86`;
  - `db.ts:4424-4430`;
  - and one comment that becomes false the moment a delete exists: `r2Storage.ts:227`. It says "the app never deletes or moves a stored object", and that sentence is why a "yes, it exists" is cached for the life of the process.
- **The screen promises the opposite.** `BidArchivePage.tsx:279` says "This removes the bid, every line on it and any plans attached to it", and :316 says the same thing for Delete all.
- **The same leak has more doors than the todo lists:**
  - removing one plan set (`bidPdfs.remove` → `db.deleteBidPdf`, `db.ts:4524`);
  - removing the sample bid (`removeSampleProject`, `db.ts:10137`), if a plan was attached to it;
  - replacing or clearing a company logo (`proposalsRouter.ts:193-225`);
  - the legacy `projects.pdfKey` (`projectsRouter.ts:111, 146`);
  - **an upload that never gets attached.** The bytes land before `confirmAttach` creates the row (`planUpload.ts:157`, `bidPdfsRouter.ts:387`), so a tab closed in between leaves a file nothing points at.
  - Aborted multipart pieces are **not** in this list. R2's 7-day abort rule clears them (`r2Multipart.ts:173`), and they never show up as objects.
- **Two rows can name one file.**
  - `bid_pdfs.storageKey` has no unique index, and `confirmAttach` does not check whether a key is already attached.
  - `collectFiles.ts:64` notes that a legacy `projects.pdfKey` can share an object with a `bid_pdfs` row.
  - So "delete the file of the row I just deleted" is wrong in general. A file may only go when **nothing** names it.
- **A file can be in either store.**
  - `resolveReadBackend` (`storage.ts:125`) falls back to the disk folder when R2 misses, so plans uploaded before the switch still open.
  - A delete therefore has to ask every store a read can reach, not only the active one.

### Backups: what happens to a deleted contractor's drawings today

- **The nightly backup (09:00 UTC) is a full copy, every night, and none is ever deleted.**
  - It writes `<prefix>/<timestamp>/files/<storage key>` for every key the database currently names (`runBackup.ts:18-25`, `collectFiles.ts:37`).
  - `references/backups.md:394` says it plainly: "Nothing deletes old backups."
- **What that means for a deleted bid:**
  - Its drawings stop appearing in **new** backups the night after the row goes, because the backup follows the database, not the bucket.
  - They stay in **every backup taken while the bid existed, forever.**
  - The purge runs at 10:30, after the backup, on purpose. That night's copy still holds what the purge removes (`disaster-recovery.md:153`).
- **Restoring an old backup brings deleted bids back.** Rows and files both come back (`backups.md:366`). Restore is a manual step, so this is a documented step, not a code fault.
- **Fixing the bucket without fixing the backups** would make the archive's "removes … any plans attached to it" true of the app and false of the company. Hence the retention question below. It is a promise to customers, and it is the owner's call.

### How I'd build it

**A. A fifth operation on the storage socket: `storageDelete(key)`.**

- **R2:** `DeleteObjectCommand`. This is already idempotent, since R2 answers 204 for a missing key.
- **Disk:** `unlink` via `diskRelativePath`, with `ENOENT` treated as done.
- **`storageDelete` asks the active store AND every `legacyReadBackends()` store**, so a file uploaded before the switch to R2 actually goes.
- **Drop the key from the R2 existence cache.** Rewrite the `r2Storage.ts:227` comment to say what is now true, and keep the old claim in the text (CLAUDE.md § "a comment claiming that something else handles it").
- **Same shape as the other four:** the `unhandledBackend` exhaustiveness in `storage.ts` makes a third backend that forgets delete fail to compile.
- **Tests:**
  - disk, against a real temp folder;
  - R2, the same way `r2Storage.test.ts` already fakes the client;
  - "deleting twice is fine";
  - "deleting a key that only lives on disk while R2 is active removes it".

**B. One place that releases files, run AFTER the rows go: `server/storedFiles.ts`.**

```
releaseStoredFiles(keys):
  for each key: if no row in FILE_SOURCES still names it → storageDelete
  failures are logged and swallowed; the sweep (C) is the net
```

- **Order: rows first, then files.** This reverses the todo, which says "BEFORE the row goes", and here is why.
  - Files first, then a failed row delete, leaves a bid that points at a drawing that is gone. That is a broken plan on screen.
  - Rows first, then a failed file delete, leaves an orphan. That is today's state, which the sweep clears.
  - CLAUDE.md § Scheduled work: failure points at "keeps too much", never "deletes too early".
- **"Still named" is read from `FILE_SOURCES`** (`server/backup/collectFiles.ts:37`), the same hand-kept list the backup uses. `backup.test.ts` already fails when a new storage-key column is missing from it, so the delete inherits that guard and cannot fall behind it.
- **Every door calls it:**
  - `deleteBidForever` (and so the purge, Delete forever and Delete all);
  - `deleteBidPdf`;
  - `removeSampleProject`;
  - logo confirm and clear;
  - the legacy project delete.
  - Each caller reads its keys first (`SELECT storageKey … WHERE bidId = ?`), deletes the rows, then releases the keys.
- **Forcing function:** a source test in the `scopeDiscipline.test.ts` style fails if `db.delete(bids)`, `db.delete(bidPdfs)` or `deleteBidForever` is called from anywhere except the functions that release. A rule with no test is how this leak got through three delete features.
- **Fix the stale comments** at `purgeArchivedBids.ts:79` and `db.ts:4424` in the same commit.

**C. A sweep for the files already orphaned, and for anything B ever misses: `scripts/sweepOrphanPlans.mts`.**

- **Lists the bucket (and the disk folder), and subtracts every key `FILE_SOURCES` names.**
- **Only touches objects older than 7 days**, which covers an upload waiting for `confirmAttach`. Seven days matches the multipart abort rule.
- **Dry run by default.** It prints each key, its size and age, and the total.
- **`--apply` deletes.**
  - Against production it also needs `ALLOW_REMOTE_DATABASE=yes` (`scripts/databaseGuard.ts`), because the list of keys to keep comes from the database.
  - It **refuses** when the database names zero keys, or when it would delete more than half the bucket. An empty or wrong `DATABASE_URL` looks exactly like "every file is an orphan".
- **Reports an outcome, not an intent** (CLAUDE.md § "a count taken before the change"): it lists the bucket again after `--apply` and prints `objects 412 -> 377, orphans 35 -> 0`.
- **Run it once by hand** after B is live. Whether it should also run nightly is a question below.

**D. Backup retention, in the backup job itself.**

- **After a SUCCESSFUL run, delete run folders older than N days** (recommendation: 30).
- **Keep the newest 7 successful runs whatever their age**, so a month of failed backups can never prune the last good one.
- **Never prune on a night the backup itself failed.**
- **The clock is a parameter**, as in `purgeExpiredBids(now)`, so the rule is testable without waiting 30 days.
- **Uses the `R2_*` backup token, which already writes `bidsoftware`.** The plans tokens never gain access, and nothing changes in § 1a of `backups.md`.
- **Write the promise into `backups.md` § 9 and `disaster-recovery.md`:** "a restore undoes every delete made after the backup was taken — re-delete those bids by hand".
- **With 30 days, a hand-deleted drawing is gone from the app at once and from every backup within 30 days.** An archived bid is purged after 30 days and gone from backups 30 days after that. Retention also caps the bucket at about 30 nightly copies of the plans. Today it grows by one full copy every night.

### Schema

**None.**

- The keys to release are read from existing rows before they go.
- The sweep compares the bucket with existing columns.
- Retention lists folders that already carry their date in their name (`history.ts:113`).

### Verify

- **No screen changes, so the checks are the stores themselves.**
- **Locally, with `pnpm dev:r2`:**
  1. Attach a plan, and confirm the key in `pnpm r2:ls`.
  2. Delete the bid forever.
  3. Confirm the key is gone, measured before and after.
- **The same on disk:** check that the file under `.local-storage` goes.
- **Leave the "Bar layout check" fixture alone.** Use a new bid.

---

## 2. Run totals and the bid disagree

This is the open item at `todo.md:1343`.

### What exists: three readings of the same runs

- **The run totals** (`takeoffRuns.totals`, `takeoffRunsRouter.ts:1163`) are the "This bid, all sheets" block in `RunsPanel.tsx:2144`. They count `status === "committed" && !isSuggestion`.
- **The bid** (`groupRunFootage`, `runTypeFootageCore.ts:133`) prices lines live through `withTracedFootage` (`db.ts:5045`). It skips suggestions, runs with no type and branch-wiring runs. It has no status filter.
- **The materials list** (`totalQuantities` over `realRuns`, `materialsListRouter.ts:350`) counts every run that is not a suggestion.

| Run                                | Run totals | Bid                   | Materials list |
| ---------------------------------- | ---------- | --------------------- | -------------- |
| draft, typed                       | no         | **yes**               | yes            |
| draft, no type                     | no         | no                    | **yes**        |
| finished, no type                  | **yes**    | no                    | yes            |
| finished, answered "branch wiring" | **yes**    | no (not even conduit) | yes            |
| suggestion                         | no         | no                    | no             |

**The last "yes" is a third difference the todo does not list.**

- A run the estimator called branch wiring (D18) contributes nothing at all to the bid, not even its conduit (`runTypeFootageCore.ts:197-208`, `continue` before any footage is added).
- The totals and the materials list never ask `runWireOwnership`, so they count it.
- I read this in the code; I have not measured it.

**Other places that encode the current meaning** (CLAUDE.md § "a fix can manufacture the fault"):

- `takeoffRuns.drops` (:1466) is committed-only, **so that it agrees with the totals.** It has to move with them.
- The export's note at `shared/takeoffExport.ts:313` says the totals "will read lower while any run is a Draft".
- `takeoff-spec.md:264` **T5** decided "from finished runs, leaving out drafts".
- Tests `takeoffRuns.test.ts:504` and `:530` assert that drafts are excluded.
- The reconciliation in `takeoffExport.test.ts:462` adds the untyped 10.56 ft.
- The panel caption says "Finished runs only. Drafts and suggestions are not counted." (`RunsPanel.tsx:2228`).

**How a run ends up with no type.**

- The Conduit and Cable buttons start a trace with nothing armed, and it saves `runTypeId: … ?? null` (`TakeoffPage.tsx:3962`).
- The comment at :2132 says "the first trace opens the picker", which does not match that code. That needs checking on screen before anyone relies on either.
- `todo.md:1615` recorded 2 untyped runs on production on 2026-09-26.

### How I'd build it

**Recommendation: the totals block states what the bid prices, and lists what it leaves out, with the footage.** Every change lands on the totals panel. No bid number moves, and that is the main argument for this option: the other way round would drop every unfinished draft off live bids, silently, on the day it shipped.

1. **One shared rule, taken from the row: `shared/runBidStanding.ts`.**
   - `runBidStanding(run) → "priced" | "suggestion" | "noType" | "branch"`.
   - `groupRunFootage`, `totals`, `drops` and the materials list all ask it, instead of each keeping its own filter. That is three filters today, and three is how they drifted apart.
   - It takes the row (CLAUDE.md § "structural in the maths"), so a later field cannot be left out of one copy.
   - Runs on unscaled sheets stay what they are today: counted as unmeasurable and said under the totals. That is a quantity question, not a standing.
2. **`totals` counts `"priced"` runs**, drafts included, and returns what it left out beside the figures:
   `leftOut: { noType: { count, conduitFeet, cableFeet }, branch: { count }, draftCount }`.
   - It shows the untyped **feet**, not just a count, because that is the number somebody would otherwise go hunting for.
3. **The panel says it plainly, in the style its warnings already use** (`RunsPanel.tsx:2168-2226`). Draft wording:
   - Caption: "What the bid prices, all sheets. Includes 3 runs not finished yet." The second sentence appears only when there are drafts.
   - Amber: "2 runs have no type — 48.0 ft of conduit is not on the bid. Give each run a type to price it."
   - Plain: "1 run is branch wiring — the devices' whips pay for it, so it is not counted here."
   - Each line appears only when its count is above 0, the same rule `IncompleteFiguresNote` follows.
4. **Forcing test.** A fixture with one run of every row in the table, plus an unscaled sheet, asserts that the totals' conduit, cable and wire equal the sum of `groupRunFootage`'s rows **exactly**. It also asserts that `leftOut` adds back to the materials list's reading. That test cannot pass while the three readings disagree, which is the point of it.
5. **Change the other places that encode the old meaning, in the same commit:**
   - `drops`;
   - the export note;
   - the two draft tests, which get rewritten to assert the new rule, not deleted;
   - the reconciliation test, which becomes a direct equality;
   - the caption;
   - T5, with a line saying what replaced it and why, and this plan citing T5 as what it overrides (CLAUDE.md § "Where decisions live").
6. **Look at it** (CLAUDE.md § "a layout or copy change is not verified"). On a bid with a draft, an untyped run and a branch run:
   - read the totals and the bid's run lines side by side;
   - then give the untyped run a type;
   - then watch **both** numbers move.
   - `refreshRuns` already invalidates `totals` (`TakeoffPage.tsx:2560`). The check is that it also moves the bridge query, per CLAUDE.md § "a test that calls the server cannot see a screen".

### Schema

**None.** `status`, `runTypeId` and `branchWiring` are existing columns. The only change is the return shape of `totals`.

### Measure first (the todo asks for it)

This is a read-only query. It needs the production URL, so the owner runs it or says to:

```sql
SELECT status, runTypeId IS NULL AS noType, branchWiring, COUNT(*)
FROM takeoff_runs WHERE isSuggestion = 0
GROUP BY 1, 2, 3;
```

Production is mostly test fixtures, so a small answer is not evidence that the case is rare. The fix does not depend on the count. The count says how many screens change on the day it ships.

---

## 3. Plans are too hard to find

### What exists

- **The sidebar has no Plans entry, deliberately.**
  - The sidebar is eight destinations, down from fourteen (`appRoutes.ts:5-8`, `BidRenderShell.tsx:8-19`).
  - CLAUDE.md, § Architecture: `/bids/:id/plans` is not in the nav because "each needs a bid, so a top-level entry would dead-end on 'which one?'". The shell repeats it at :472-493.
  - `plan-viewer-overhaul.md:4048` warns against a ninth entry "for a list most people will touch twice".
- **Dashboard cards have no way into the plans.** A card opens the bid and nothing else (`DashboardPage.tsx:555`). The dashboard query carries no plan or sheet count.
- **On the bid, Plans is one of three equal small outline buttons:** Plans, Count and Send ▾ (`BidsPage.tsx:565-598`). It has a sheet-count badge. The page body mentions "the Plans screen" six times as plain text, never as a link.
- **Nothing lists plan sets across bids.** `bidPdfs.list` requires a `bidId` (`bidPdfsRouter.ts:177`).
- **Uploading is already obvious.** "Upload a plan" is the first choice on the Dashboard (`StartBidCards`, `NewBidMenu`), and it creates the bid and opens its plans. The problem is getting **back**.
- **The AI navigation helper has no plans target** (`shared/navigationTargets.ts`), so "where are my plans?" gets no link.

### How I'd build it: two phases, and the second is the owner's call

**Phase 1: obvious routes, within the current nav rule.**

1. **A "Plans · 5 sheets" chip on each Dashboard card that has plans**, which opens `/bids/:id/plans` directly. It stops the click from also opening the bid. The `onOpenPlans` prop already exists (`BidRenderShell.tsx:230`).
   - `getDashboardBids` gains a `sheetCount`, one grouped count over `bid_pdf_sheets`.
   - A card with no plans shows no chip. It is not a prompt to add plans: CLAUDE.md § "as manual or as automated" treats a bid without drawings as a legitimate bid.
2. **On the bid page, Plans becomes the primary button when the bid has plans.** Count and Send stay outline.
   - With no plans, the button reads "Add plans" and stays outline.
   - The six "the Plans screen" mentions become links.
3. **A "Recent plans" row on the Dashboard**: the last 4 plan sets, one click back to the sheet you were on.
   - Ordered by `bid_pdfs.createdAt`, server-side, from a new company-scoped `bidPdfs.recent` that filters on `ctx.scope.dataUserId` and leaves out archived bids.
   - Paginated in the query rather than sliced, per CLAUDE.md § Responsiveness 2, even though it only shows 4.
4. **A `plans` entry in `navigationTargets.ts`** that points at the Dashboard, with a purpose that names the chip. `appRoutes.test.ts` cross-checks it.

**Phase 2: a Plans entry in the sidebar, only with a real screen behind it.**

- **`/plans`: every live bid that has plans.**
  - Each row shows the bid name, status, sheet count and upload date, and opens its plans.
  - An "Upload a plan" button at the top uses the existing new-bid flow.
- **That is not the "which one?" dead end.** The list is the content, and uploading works from it. But it does sit close to the Dashboard, which is why it is a question.
- **The work:**
  - a new `Route` in `appRoutes.ts` and its test;
  - a `NavBtn` in the Work group;
  - `/bids/:id/plans` highlights Plans instead of Dashboard (`BidRenderShell.tsx:501, 701`);
  - the mobile header label;
  - `navigationTargets.ts`;
  - **and CLAUDE.md, the shell comment and `appRoutes.ts` rewritten to say nine, and why.** A rule that the nav contradicts is worse than no rule.
- **Mobile's five bottom slots are full**, so on a phone Plans would stay reachable from the Dashboard only.

### Schema

**None in either phase.**

- A sheet count and a recent-plans list are reads of existing tables.
- "Recent" means most recently **uploaded**. Most recently **opened** would need a timestamp. That is flagged for Track A below, and not needed for Phase 1.

### Verify on screen

- At the size it ships, and on a phone width:
  - the card chip;
  - the chip's click not opening the bid as well;
  - the primary button;
  - the Recent row with 0, 1 and 5+ plan sets.
- Then upload a plan and check the Recent row and the card count **move** without a reload.

---

## For Track A (optional; nothing here waits on them)

- **A deleted-bids log** (`bid id, deleted at`) would let a restore re-apply the deletes made after the backup it restores. Without it, that step is manual and documented (piece 1, D).
- **`bid_pdfs.lastOpenedAt`**, only if the owner wants "Recent plans" ordered by use rather than upload (piece 3).
- **Not recommended:** a unique index on `bid_pdfs.storageKey`. The reference check in piece 1 makes shared keys safe, and the index would fail on any database that already holds a duplicate.

---

## Questions for the owner, each with a recommendation

1. **How long may a deleted contractor's drawings live on in backups?**
   - **Recommend 30 days, with the newest 7 good backups always kept.**
   - Customer wording: "Deleted drawings are removed from BidRidge straight away and from our backups within 30 days."
   - Shorter weakens disaster recovery. Longer is a promise nobody asked us to make.
2. **Delete files the moment the row goes, or only in a nightly sweep?**
   - **Recommend at once (piece 1 B), plus the sweep.**
   - "Deleted" should mean deleted. The sweep is the net, not the mechanism.
3. **Should the sweep run nightly, or by hand?**
   - **Recommend by hand for the first month**, dry run first. Make it nightly after two clean runs.
   - A job that deletes customer files by absence should earn its schedule.
4. **What is the run totals block FOR?**
   - **Recommend "what the bid prices"**, drafts in, with untyped and branch runs listed underneath with their feet. This overrides T5.
   - The alternative, finished-only everywhere, lowers live bids with nothing on screen to say so.
5. **Should the materials list follow the bid too**, with a line naming the runs it leaves out?
   - **Recommend yes.**
   - A supplier list ordering pipe the bid does not price is the same disagreement in a third place. The export already carries that note.
6. **A Plans entry in the sidebar?**
   - **Recommend Phase 1 now and Phase 2 only if plans still feel hidden after it.**
   - The chip and the Recent row put plans one click from the first screen without undoing the nav rule. Phase 2 is written up above and can follow straight on.
7. **"Recent plans": by upload date, or by last opened?**
   - **Recommend upload date for now.** It needs no schema.
   - Last opened needs Track A's column.
