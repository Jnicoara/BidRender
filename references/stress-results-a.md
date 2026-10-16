# Stress results — Track A

Track A's drills and measurements. **`references/stress-results.md` belongs to
Track C** (on `track-c`); this file is kept apart so the two never collide in
a merge. Fold them together whenever both are on local-dev.

## Counting deep test — 2026-10-15 night

**Fixture:** plan PDFs written byte by byte with a known answer
(`client/src/lib/testPlanPdf.testHelper.ts`, sheets in
`client/src/lib/countingFixtures.testHelper.ts`). Sheet 1 (17 × 11):
receptacles in four turns, crowded 16 pt apart, beside a room name, with a
wire through, by a wall; GFCI look-alikes (same shape + "GF"); bare circles;
1.5× receptacles; grey "existing" receptacles; junction boxes vs smoke
detectors (same circle, J vs SD); troffers in two turns vs bare rectangles;
switches. Sheet 2: other places, other counts. Sheet 3 (hard): a wire ending
on the circle, circuit numbers beside, gray hatching through, 45° turns, a
4 × 3 edge-to-edge troffer grid. Plus sheet 1 as a 150 dpi noisy scan.

Read through the plans screen's own path (pdf.js → `vectorGeometry` →
`findMatching` / `findOnScan`); scored per symbol. **Accuracy is the same
before and after tonight: no matcher change was needed** (one message was
corrected, below).

### Line-work sheets (`countingDeep.test.ts`, golden counts in the Gate)

| Symbol boxed              | True                  | Found | Missed | Look-alikes offered (all flagged) | In Confirm all        |
| ------------------------- | --------------------- | ----- | ------ | --------------------------------- | --------------------- |
| Duplex                    | 10                    | 10    | 0      | 3 GFCI, 2 grey                    | **10 right, 0 wrong** |
| GFCI                      | 3                     | 3     | 0      | none                              | 3 / 0                 |
| Bare circle               | 3                     | 3     | 0      | 15 (every duplex holds a circle)  | 3 / 0                 |
| Junction box              | 4                     | 4     | 0      | none (SD circles not offered)     | 4 / 0                 |
| Smoke detector            | 4                     | 4     | 0      | none                              | 4 / 0                 |
| Troffer                   | 6                     | 6     | 0      | none                              | 6 / 0                 |
| Bare rectangle            | 3                     | 3     | 0      | 6 troffers                        | 3 / 0                 |
| Switch                    | 5                     | 5     | 0      | none                              | 5 / 0                 |
| Hard-sheet duplex         | 11                    | 9     | **2**  | none                              | 9 / 0                 |
| Sheet 2, boxed on sheet 1 | 3 dup / 2 trof / 1 GF | all   | 0      | 1 GFCI (flagged)                  | exact / 0             |

**Not 100%, and why:**

- **45° devices: missed on purpose.** Plans draw devices square, and every
  extra angle tried is a chance to match a non-device. The person sees 9
  offered and taps the 2.
- **1.5× copies: not offered.** A different size is treated as a different
  symbol. Box one of the big ones, or tap them.
- **Edge-to-edge grid: cannot be boxed.** Every edge and diagonal runs on
  into the neighbours, so all of it is a line running through, the same rule
  that lets a wire pass through a receptacle. **Found tonight:** the screen
  said "Nothing is drawn inside that box", which was false. It now says the
  fixtures touch, and to box one that stands alone or tap them
  (`TOUCHING_SYMBOLS_MESSAGE`).

**The test bites:** with `MIN_COVERAGE` 0.8 → 0.5, 5 of 13 cases go red.

### Scanned copy (`countingScan.test.ts`, opencv.js, no AI)

| Symbol         | True | Found | Missed | Look-alikes offered    | In Confirm all                  |
| -------------- | ---- | ----- | ------ | ---------------------- | ------------------------------- |
| Duplex         | 10   | 10    | 0      | 3 circles, 3 GFCI      | **0** (every find needs a look) |
| GFCI           | 3    | 3     | 0      | 3 circles, 9 duplexes  | 0                               |
| Junction box   | 4    | 4     | 0      | 3 circles, 4 smoke     | 0                               |
| Smoke detector | 4    | 4     | 0      | 3 circles, 1 GFCI, 4 J | 0                               |
| Troffer        | 6    | 6     | 0      | none                   | 0                               |
| Switch         | 5    | 5     | 0      | none                   | 0                               |

On a scan the words beside a symbol (GF, SD, J) are pixels, not read, so
**every** find carries "check it by eye" and Confirm all takes none. A
scan can never count a look-alike by itself; the person confirms each find.
100% hands-off is not possible on a scan without reading those words, which
is the AI button's job.

### AI reading — saved fake answers only, no money spent

`server/countingAiFake.test.ts` (router, `invokeLLM` mocked) and
`countingScan.test.ts` (client rules):

- The reply parser takes only the four closed answers; anything else becomes
  "no answer", never a guess.
- One press = one call. **Nothing on the bid moves** (marks and lines counted
  before and after). An unreachable AI changes nothing and says so. With AI
  switched off it refuses before any call.
- **An AI answer never confirms a find.** With right answers, Confirm all
  takes 9 of the 10 duplexes. The tenth, with a wire through it, keeps its
  "weaker likeness (0.81)" flag. No look-alike gets in.
- **A wrong "same" from the AI lets that look-alike into Confirm all**
  (still only on the person's press). Morning question N1.

### Manual counting (`server/countingManual.test.ts`) — totals = hand math

One receptacle = $3.00 parts + 0.15 h × $62 = $12.30.

| Step                                                            | Marks | Line qty | Direct (hand) | Direct (app) |
| --------------------------------------------------------------- | ----- | -------- | ------------- | ------------ |
| Owner 5 on sheet 1 + estimator 4 on sheet 2, at the same moment | 9     | 9        | 110.70        | 110.70       |
| Estimator's batch undone                                        | 5     | 5        | 61.50         | 61.50        |
| Redone                                                          | 9     | 9        | 110.70        | 110.70       |
| 2 marked existing, 1 remove                                     | 9     | 6        | 73.80         | 73.80        |
| 3 tagged "Wall" (location)                                      | 9     | 6        | 73.80         | 73.80        |
| Line owner-furnished (labor only)                               | 9     | 6        | 55.80         | 55.80        |

**Offline, then back online — a real bug, fixed on the server:** a batch
resent after a lost answer wrote every mark twice (3 → 6). Now each tap is
placed once per key (`server/markReplay.ts`, `markReplay.test.ts`, red
before). It takes effect with one line on the Plans screen (Track B's file,
`track-b-handoff.md`). It is held in memory, so a durable column is in
`todo.md`.

Covered elsewhere, not repeated: twin fold (`server/twinFold.test.ts`),
status pricing (`server/markStatusPricing.test.ts`), undo/redo exact restore
(`server/takeoffUndo.test.ts`), several counts in one batch
(`client/src/lib/markBatches.test.ts`). **Mouse and finger:** the counting
part of the browser journey (queue item 3) taps on laptop, iPad and phone.

## Fresh start — 2026-10-16

Empty local database (`bidrender_test_fresh_a`, utf8mb4_unicode_ci) →
`scripts/migrate.mts` → `scripts/seedBaseline.mts` → tests → dropped.

- **Migrations:** 164 applied from zero, `0000_flippant_hiroim` to
  `0163_material_price_history`, in 36 s. Result: 87 tables, **205 foreign
  keys** (the release plan's expected figure).
- **Seed:** 1,717 shipped materials (= the seed files), 24 run types, 224
  starter assemblies, 6 starter labor rates.
- **Golden bids: all 9 exact** on the brand-new database. The start-leaves-
  existing-shops-alone tests pass (bootLeavesStarterNumbers 17,
  bootLeavesCompanyRows 2, seedPreservesUserPrices 4, starterAssembliesSeed
  14).
- **New shop gets the full starter:** `server/freshShop.test.ts`. Through the
  screens' own reads, a company that never edited anything sees every active
  shipped material, starter assembly, rate and run type, and owns none of
  its own.
- **The Gate does this on every full run** (an empty MySQL, every migration,
  the seed, the whole suite), so it is not a one-off.

## Backup + restore drill — 2026-10-16, local only

`scripts/backupDrill.mts`: the **real** `runBackup` and `verifyBackup` (the
nightly job's code), with the R2 bucket replaced by a local folder and the
plans read from `.local-storage`. Then every bid is priced on both sides with
the bid screen's own maths (`scripts/bidTotalsDump.mts`, read only). Source:
the local real-data copy, read only. Restored into
`bidrender_test_restore_drill`, then dropped. Nothing was sent to R2.

|                              | Source        | Restored      |
| ---------------------------- | ------------- | ------------- |
| Tables                       | 87            | 87            |
| Rows                         | 38,851        | 38,851        |
| Bids priced                  | 4,386         | 4,386         |
| Bids whose total differs     | —             | **0**         |
| Sum of every bid's Total due | $1,748,599.67 | $1,748,599.67 |

- **Backup:** 1.1 s for the database (1.5 MB gzipped), plus 131 of 144 plan
  files (310 MB). The run says **PARTIAL**, honestly: 13 files are named in
  the manifest as unreadable, all of them test or CI-smoke rows whose files
  were never on this machine (`test/…/e1.pdf`, `bid-plans/…/ci-smoke-plan_…`).
  So the drill exits 1, the strict answer `scripts/backup.mts` also gives.
- **Restore:** 8.8 s, and it matches the manifest table for table.
- **Found on the way:** aiming the restore at the `mysql` system database
  fails locally (access denied); the drill aims at the server itself.
  `scripts/verifyBackup.mts`'s own example
  (`VERIFY_DATABASE_URL=…/mysql`) may hit the same thing on a locked-down
  login. That is noted here, not changed.

## Failure drills — storage, AI, email — 2026-10-16

`server/failureDrills.test.ts`, the same shape as Track C's database drill:
down → honest, nothing lost → back → recovers with no restart. Nothing
reached R2, the model, or the email provider.

| Service                                                                    | Down                                                                                                                                                                                                 | Nothing lost                                                                                                                                                                     | Back                                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Plan storage** (a fake S3 server on this machine, switched off)          | Opening a plan **throws**, which the proxy answers as 502 "Storage backend error". It is never "that file does not exist", because the existence cache keeps only a real 404/403 (`r2ObjectExists`). | Deleting a file while down: rows go first, the file counts as `failed` and is left for the orphan sweep (`storedFiles.ts`).                                                      | The same plan opens again at once; nothing was remembered from the outage. |
| **AI** (`invokeLLM` fails)                                                 | "The reader could not be reached. Nothing was changed — check these by eye."                                                                                                                         | Every answer is null; no mark or line moves (`countingAiFake.test.ts` counts them).                                                                                              | The next press answers normally.                                           |
| **Email** (the real door, production settings, fake key, `fetch` replaced) | No answer → `notSent`, logged, never a crash. A quota refusal (429) **pauses** email: availability says "later", and a reset request answers "could not send" instead of pretending.                 | A reset token is stored before the send. The reset screen answers alike for every address (owner's no-enumeration rule), so a failed send for one account shows only in the log. | The pause lifts on its own (the next UTC day), and the next send goes.     |

## Speed on big data — 2026-10-16

`server/speedBigData.test.ts`, on demand (`SPEED_BIG_DATA=1`; built in 6 s on
the laptop): one company with **61 bids** (60 with 50 counted marks each, sent
to the bid), a **500-sheet** plan set, **5,000 marks on one sheet**, and the
full shipped catalog (1,717 materials). Same limits as the Gate: screen < 2 s,
save < 1 s; median of 3 after a warm-up.

| Screen / save                        | Median     | Max    |
| ------------------------------------ | ---------- | ------ |
| Dashboard (61 bids)                  | **493 ms** | 559 ms |
| Bid with 5,000 marks                 | 66 ms      | 68 ms  |
| Plans — the 5,000-mark sheet         | 157 ms     | 166 ms |
| Sheet list of 500                    | 8 ms       | 12 ms  |
| Materials (full catalog)             | 38 ms      | 40 ms  |
| Materials list (5,000 marks)         | 99 ms      | 105 ms |
| Proposal                             | 28 ms      | 31 ms  |
| Place a mark on the 5,000-mark sheet | 8 ms       | 10 ms  |
| Rename the big bid                   | 7 ms       | 7 ms   |

**Nothing over.** One trend to watch: the **dashboard grows with the number
of bids**, about 8 ms a bid here (39 ms at 1 bid in the Gate, 493 ms at 61).
At that rate it crosses 2 s near 250 bids for one company. That is not a
problem today; the todo is to page it or sum it in SQL before any shop gets
there. The everyday Gate fixture can't see this, because it has one bid.

## Whole-job journey in a browser — 2026-10-16

`e2e/journey/` (local only; refuses any non-local server):
`SMOKE_BASE_URL=http://127.0.0.1:3018 npx playwright test -c e2e/journey/playwright.config.ts`.
A brand-new account signs up through the screen, sets an hourly rate, a
profit and (since tonight) the traced-run labor rate, then makes a bid,
uploads the fixture plan, takes the printed scale, captures two legend
symbols, and counts them (mouse on laptop, finger on iPad and phone). It
links and sends the counts, traces a run with wire and ends, sets the run
height, adds drops and a homerun, tags a line owner-furnished, reads the
bid totals, prints the proposal, and downloads the takeoff CSV. **Every
printed number is checked against hand math in the test**, read from the
screen text and the downloaded file.

| Size                  | Result | Time |
| --------------------- | ------ | ---- |
| Laptop 1366×768       | pass   | 38 s |
| iPad 820×1180 (touch) | pass   | 34 s |
| Phone 390×844 (touch) | pass   | 59 s |

Set through the API, and why (said in the test): material prices (14 rows,
the Materials screen's own test), and the homerun's panel and circuit (the
shared fixture plan prints no circuit tags to read).

**Found: traced runs' labor priced at $0/h on every bid**, because nothing
could set the rate. Fixed going forward (Settings › Pricing); morning
question N4. **Found: a legend link does not reach a count already made**,
handed to Track B. Mouse and finger give the same counts (the same
assertions pass on all three projects).
