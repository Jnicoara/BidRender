# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BidRidge — a trade-contractor bid/estimating tool. Users build a personal catalog of materials and labor rates, assemble them into reusable assemblies, attach them to project bids, and upload plan PDFs to take off quantities against a live crosshair viewer.

**Electrical-first by sequencing, not electrical-only by design.** Multiple trades are in the data model from the ground up: every assembly carries a `trade` (`drizzle/schema.ts`, defaulting to `"electrical"`), and a bid carries a `trades` array — one bid may mix line items from several unlocked trades. Unlocking is gated at the app layer rather than in the schema, deliberately, so a new trade needs no migration. Electrical is simply the first trade to ship, which is why the seeded catalog, the trade slang and the starter assemblies are all electrical today. Do not read that focus as a constraint and bake an electrical-only assumption into anything new — adding plumbing or HVAC should be content plus an unlock, not a refactor.

`trade` is a different axis from `projectType` (residential/commercial/both), which is only a filter on the assembly library. The schema says so explicitly; do not wire the two together.

The product is **BidRidge**. It was called **BidPhase** until v5.75, **HelixBid** until v5.119 (renamed because HelixBid clashed with an existing company), and **BidRender** until v6.1. `bidridge.com` is registered and trademark clearance came back clear.

**The v6.1 rename was deliberately user-visible ONLY, and the split is the point.** What a person reads now says BidRidge: the wordmark, the tab title, on-screen copy, the landing page, exported filenames. What only a machine reads still says `bidrender`, on purpose — the repo and local folder, the database `bidrender` and login `bidrender_app`, the buckets `bidrender-plans` and `bidsoftware`, the `R2_PLANS_*` names, the DigitalOcean app, the Cloudflare worker `bidrender-cron`, the `BidRenderShell` component, and `package.json`'s `name`. Several of those are baked into stored rows or live infrastructure, and renaming them is churn with real risk and no user benefit. **Do not "finish the job" by renaming them.**

**`bidridge.com` is the PRIMARY domain and the one to use in any command, link or check.** It was added to App Platform on 2026-09-17; `bidrender.com` was removed from App Platform and is now only parked.

**This paragraph used to say the opposite** — that `bidrender.com` still served the app and the name gap was expected — and it was left stale after the move. On 2026-09-18 that sent a newly written deploy check at the parked domain, where it would have returned nothing useful about the running build. **A wrong domain in a document is not cosmetic: it is a check that cannot work.** Same family as the rule in `workers/cron/wrangler.toml`, which spells out that `APP_BASE_URL` must be the primary domain and never a redirecting one, because a redirect turns the cron Worker's POST into a GET and the handler never answers.

The `/manus-storage` route, the `helixbid:` localStorage keys and the `helixbid-` cache prefix survive from earlier names for the reasons given above and below; they are not oversights. `todo.md` and `CHANGELOG.md` entries recording past renames are historical record and stay as written.

**A few `helixbid` names are kept on purpose — do not rename them.** The localStorage keys (`helixbid:trace-draft:`, `helixbid:stamp-queue:`, `helixbid.crashes`, `helixbid.planReader.autoRead`) and the service worker's `helixbid-` cache prefix, because a browser may already hold unsent work or caches under them and a renamed key never finds them. The seed lock names in `server/db.ts`, because an old and a new build must take the same lock during a deploy. And the R2 backup prefix default `helixbid` in `server/backup/config.ts`, because that is the folder the existing backups live in.

## Commands

```bash
pnpm dev              # start dev server (tsx watch, Vite middleware) — NODE_ENV=development
pnpm dev:r2           # same, but plan files go to the Cloudflare R2 bucket bidrender-plans
pnpm r2:ls [prefix]   # list what is actually in that bucket
pnpm build            # vite build (client) + esbuild bundle (server) -> dist/
pnpm start            # run production build (NODE_ENV=production)
pnpm check            # tsc --noEmit — run after any nontrivial change
pnpm test             # vitest run (server/**, client/src/lib/**, scripts/** — see vitest.config.ts)
pnpm format           # prettier --write .
pnpm db:push          # drizzle-kit generate, then scripts/migrate.mts, against DATABASE_URL
```

Run a single test file: `pnpm vitest run server/materials.test.ts`. Tests use `appRouter.createCaller(ctx)` to call tRPC procedures directly (no HTTP) — see `server/v545.test.ts` for the pattern of building a fake `TrpcContext` with an admin/user role.

There is no separate lint script; `pnpm check` (TypeScript strict mode) is the correctness gate.

## Seeing a change in the running app — the session is the hard part

**You cannot reach a single screen without minting a session yourself**, and
working that out from scratch costs half an hour. It is already solved:

```bash
node .claude/skills/run-bidrender/devsession.mjs --list-users   # which openId is real
node .claude/skills/run-bidrender/devsession.mjs <openId>       # prints the token + snippet
node .claude/skills/run-bidrender/smoke.mjs                     # drive the API, no browser
```

`.claude/skills/run-bidrender/SKILL.md` is the full reference — starting the
server, driving the API, driving the browser, and the gotchas. **Read it before
running the app**; it is a skill rather than a doc, so nothing surfaces it
unless you go looking, and that is how it came to be re-derived by hand on
2026-09-18.

**Two things in that skill are out of date** — corrected there, repeated here
because they are the ones that mislead:

- **"The app is OAuth-only" is false.** Sign-in is email and password in our own
  `users` table (§ Architecture). Minting still works for the same underlying
  reason — the session cookie is a plain HS256 JWT the app signs and verifies
  itself — but `VITE_OAUTH_PORTAL_URL` and `OAUTH_SERVER_URL` are no longer
  needed, and `pnpm dev` on its own is enough.
- **`.env` is no longer just `DATABASE_URL`.** It now carries `JWT_SECRET`,
  `VITE_APP_ID`, `LOCAL_STORAGE_DIR`, `DISABLE_AI_FEATURES`,
  `DISABLE_SCHEDULED_JOBS` and `CRON_SECRET`, so the four-variable command line
  the skill shows is unnecessary.

**A session token is a bearer credential even locally.** Do not paste one into a
file that outlives the check, and delete whatever you wrote it into. Setting the
cookie from a page served on ANOTHER localhost port works and keeps the token
out of the transcript — cookie scope ignores the port.

**There is a fixture bid for exactly this: "Bar layout check" (user 1),** with
the Old Blueridge school 5-sheet set attached from `.local-storage`. It exists
because `bids` had nothing for user 1, so every visual check of the plan viewer
started by building one. **Leave it.** Sheet 1 is E0.01 — general notes and
legend, no scale — which is the sheet type most viewer changes need to be
checked against, and sheets 2–5 are drawings. If its plan 404s, the
`storageKey` column holds the key with real spaces; `diskStorage` percent-
encodes them when deriving the path, so the on-disk name contains `%20` and the
column must not.

## A layout or copy change is NOT verified until somebody has looked at it

**`pnpm check` cannot see a screen.** Neither can a diff, a test, or a careful
read of your own code. If a change alters what a person sees — layout, wording,
an icon, the state a control shows — **render it and look at it, at the size it
actually ships**, before calling it done.

This is a rule rather than advice because it has now paid for itself three
times in one day, 2026-09-18, on three different kinds of fault that every
other check passed:

- **Visual weight.** A regrouped toolbar typechecked clean and had shipped the
  most eye-catching control on a sheet where that control was the least useful
  thing present.
- **Size.** Two hand-drawn icons looked right at 72px and read as a plug and a
  bowtie at the 14px they are used at.
- **State, and this one was a wrong NUMBER rather than an ugly screen.** The
  job heights popover rendered `0 ft 0 in` under a caption reading "not set" —
  in the feature whose entire purpose is that an unset height must never look
  like a zero. Nothing failed. It just said something false.

- **Staleness, 2026-09-19, and this is a whole CLASS rather than one fault.**
  The counted-items panel offered "Send 5 to bid" and said "1 count is not on
  the bid yet" using the numbers it had fetched when the page loaded. Marking
  two more moved nothing, because the mutation invalidated the queries it knew
  about and not the one added that morning. Both the control and the sentence
  were confidently wrong rather than blank.

The third is the one to remember: **the failures worth catching here do not
look like breakage.** A broken screen gets reported by whoever hits it. A
screen that quietly states a wrong number gets believed.

### A test that calls the server cannot see a screen showing yesterday's answer

**The fourth one above is structurally invisible to the server suite, and that
is not a gap anybody can close by writing more server tests.** Those tests call
a router and read what it returns, so they always see the database as it is
this instant. A browser holds a cache, and the whole question is whether that
cache was told to let go. The router was right every single time.

So, whenever a change **adds a query** to a screen that already has mutations:

- find the helper the existing mutations already invalidate through — there is
  usually exactly one per screen (`refreshStamps`, `refreshRuns`) — and add the
  new query to it rather than to the one mutation you were thinking about;
- key it by what it actually depends on. The bridge query is per BID while the
  panel is per SHEET, so marks placed on another sheet move it too;
- then **look at the screen, act, and look again**. Not "does it render" —
  does the number MOVE when the thing it counts moves.

The same reasoning applies to anything derived and cached rather than stored:
the cost of being wrong is a screen that states a stale number in the confident
voice of a fresh one.

Reaching a screen needs a session, which is the genuinely hard part and is
already solved — see the block above, and
`.claude/skills/run-bidrender/SKILL.md`.

## A checklist that states a count must say what to do when it does not match

**Any instruction of the form "expect N of something" goes stale**, because N
is a fact about the code at the moment it was written and the checklist is read
at the moment somebody is about to do something irreversible.

It has now happened twice in two days. The production migration checklist said
"Expect seven applied" — true when written, and wrong by four the moment Phase
6 added migrations in a different file. It would have been read mid-procedure,
against production.

**The number is not the fix. This is:**

> If what the command prints does not match, **stop and find out why before
> going on.** A mismatch means either this line is stale or the system is not
> in the state you think it is, and those want opposite responses.

That sentence stays true forever; the count does not. **Write both** — the
count, because it is genuinely useful when it is right, and the instruction,
because it is what makes a stale count harmless. Anywhere a doc says a test
suite prints N passing, a migration applies N files, or a screen shows N rows,
it needs the second half.

## As manual or as automated as the user wants — every level is a real way to work

**Somebody should be able to work entirely by hand and never build a library at
all. Somebody else should be able to build everything up front and have every
job be one click. Every point in between is a legitimate way to work, not a
lesser one**, and the app must not push from one toward another.

This is the same idea as the AI rule above — manual mode is the product, AI is
an accelerator on top of it — applied to the catalog instead. There it stops a
feature existing only in the AI path; here it stops the library becoming a toll
gate on the work.

What it rules out, concretely:

- **Setup before value.** Demanding a library entry before the first count is
  what made the old stamp tool unusable on a fresh set, and it is why level 1
  exists (references/plan-viewer-overhaul.md § 3).
- **A lesser-looking path.** A typed price is not a degraded assembly. It says
  what it is — a price that lives on this job — and is otherwise a first-class
  count, on the bid, in the totals, in the same lists.
- **Nagging toward the library.** An offer to save something for next time is
  useful once and noise every time after. See § 5f on where that offer lives.
- **A one-way door.** Anything counted by hand can become a library item later
  with every click intact; anything from the library can be overridden on one
  job without touching the library. Both directions, always.

**The test for a new feature:** could somebody who has never opened the library
screen use this, and could somebody whose library is complete skip every step
of it? If either answer is no, the feature has picked a side.

## Where decisions live — read the older record before specifying something new

**Before writing a plan for anything, search the reference files for a decision
that already covers it.** Decisions in this project are recorded where they were
made, which is not always where the next plan gets written:

- `references/takeoff-spec.md` — the numbered decisions (D1–D15) about how the
  takeoff behaves, and the feature inventory (C, S, T, R) with what exists.
- `references/plan-viewer-overhaul.md` — the phase plan, § 6 "Decisions already
  made — do not re-open without saying why", and the per-phase specs.
- `CLAUDE.md` — standing rules that apply to every screen.
- `todo.md` § "Working on this repo — traps" — the things that bite.

**The worked example, 2026-09-18.** Decision **D3** (2026-09-14) chose how a
traced run says what it is, picking "choose before tracing, and remember it for
the next run" and rejecting "a form on every run" **by name, as bloat**. Three
days later § 2 of the overhaul document was written in a different file
specifying a table of per-run fields — the rejected option — without citing D3.
Neither file was wrong on its own. The gap was between them, where no reader
stands, and it survived until somebody used the app and reached D3's conclusion
a second time by hand.

**A plan built on that gap gets built.** Nothing downstream re-examines a
premise: not `pnpm check`, not a test, not a review of the diff. It is the same
failure as an unmeasured number in the section below — a claim that reads like
a fact because it is written down.

**So, two habits:**

1. **Before specifying, grep for the feature's name in the reference files**
   and read what is already decided about it. If something covers it, cite it —
   agreeing with it in writing is cheap and makes the next reader's search
   succeed.
2. **When a new decision overrides an old one, say so in BOTH files.** The
   older entry gets a line saying what replaced it and when; the newer one gets
   a line saying what it overrides and why. A decision that is only recorded in
   the newer file is invisible to anyone who opens the older one first — which
   is what happened here, in reverse.

## A number that can be measured should not be asserted

**If a claim is about a quantity the running app would tell you, go and ask
it.** Pixels, milliseconds, megabytes, row counts, how many of something a
screen shows. Two minutes with `getBoundingClientRect` or a query beats an
afternoon of building on a number somebody remembered.

**The worked example, 2026-09-18.** The plan for the takeoff marks said they
were "drawn at a fixed pixel size today, so at 19% on a dense sheet they
already overlap each other". It had been written down for a day and read like a
fact. Measured in the browser, it was wrong in both directions: the overlay
sits INSIDE the zoom transform, so a mark tracks the drawing exactly — 3.8px at
19% (invisible, not overlapping) and past 150px at `MAX_ZOOM` (swallowing the
symbol it marks). The fix was the opposite of the one specified.

The cost of checking was two minutes. The cost of not checking would have been
building the wrong feature and shipping it, because nothing downstream — not
`pnpm check`, not a test, not a review — re-examines a premise. A wrong premise
is the one kind of error that gets more expensive the better the work built on
it is.

**The third example is the useful one, because the rule was already written
down when it was broken — by the person who wrote it.** Migration
`0055_backfill_takeoff_groups.sql` left a re-run gap open and explained why:
closing it "means reading `takeoff_groups` inside a statement that writes to
it, which MySQL handles badly". Nobody had asked MySQL. Asked on 2026-09-18,
one day after the rule above was added to this file: it accepts the guarded
statement, and a second run inserts nothing. The guard went in before
production ever ran the file.

**Two things that came out of that are worth more than the fix.**

**Knowing the rule does not make you follow it.** The assumption was written
confidently, in a file about being careful, by someone who had just finished
writing a section about not doing that. The only thing that caught it was going
and asking the system — not a test, not a review, not the rule itself.

**It happened three more times on 2026-09-20, all in one working day, and the
pattern is the point rather than the embarrassment:**

| The rule                                                 | Broken by                                                                                                                                                      | Caught by                                                                     |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| A comment must not claim something elsewhere handles it  | A migration comment claiming a property that depended on code elsewhere                                                                                        | Running the migration against a live database                                 |
| An audit reports what it searched for, not what is there | An audit for `?? 0` that missed a fifth site written as a ternary                                                                                              | The typecheck, after the union made `whenUnset` required                      |
| Migrate first — except when the meaning changes          | The exception being written INTO the migration, while three mappings stayed wrong                                                                              | A number: 125.01 ft becoming 83.34 ft                                         |
| The same rule again, one hour later                      | Applying it to the BATCH instead of each FILE, so two additive `ALTER`s were held back with two backfills and the deploy asked for a column that did not exist | The live site: every screen touching traced runs, down until the `ALTER`s ran |

Each was written down, in the right file, by whoever then broke it, within
hours — **and the fourth is the sharpest, because the rule was applied too
broadly within an HOUR of being written, by its author, and the cost was an
outage rather than a wrong number.** Writing a rule down appears to create a
false sense that it is now handled.

**So a rule is not a mechanism.** What actually caught all four was something
that could FAIL: a database, a type, a measurement, a live site.

**Prefer a forcing function to a reminder, every time.** The three from that day
are worth copying:

- `circuitWire(row)` takes the ROW, so a mapping has nothing to destructure and
  therefore nothing to forget. It replaced three hand-built objects that had
  each silently dropped a field.
- `InlineNumberField`'s props are a UNION, so a nullable value cannot compile
  without saying what unset looks like. It replaced a paragraph asking people
  to remember.
- `commitNullableEdit` lives in `client/src/lib` rather than in the component,
  because the suite can reach one and not the other. A rule with no red to go
  to is an instruction.

**Where a forcing function is genuinely impossible, say so in the rule** rather
than implying the rule is enough.

### Where to be structural, and where to be explicit

**SILENT IN THE MATHS IS A WRONG NUMBER. SILENT ON THE SCREEN IS CLUTTER.**
Added 2026-09-20. It decides a question that comes up every time a row is
turned into something else, and the answer is not the same in both directions.

A mapping that feeds a CALCULATION should be **structural** — take the row, or
spread it, so nothing can be left out. A field that goes missing there does not
announce itself: it is a smaller number on a bid, and nobody sees a gap where a
column used to be. Three routers each hand-built `{ name, conductorCount }` from
a circuit row, and the day the ground moved into its own column every one of
them reported a circuit one conductor short.

A mapping that feeds a SCREEN should be **explicit** — list the fields. The
failure mode inverts: a column that arrives automatically is a column nobody
chose to show, and screens accumulate junk that way. There is also nothing
quiet about it, because somebody looking at the screen sees it immediately.

So in `takeoffRuns.listForSheet` the same rows are mapped twice on purpose: once
through `circuitWire` for the arithmetic, and once by hand for the panel — which
also lets the panel keep a NULL the arithmetic has to flatten to zero.

**The general form, for anything with the same shape:** ask what a missing
field would DO. If it would change a number, make it impossible to miss. If it
would change what somebody sees, make it impossible to add by accident. And
when both apply to one row, map it twice rather than picking a winner — the
cost is a few lines and the alternative is one of the two failures.

### The forcing functions stop at the test boundary, and that is a real hole

**Found 2026-09-20 while closing a different one.** `tsconfig.json` excludes
`**/*.test.ts`, so `pnpm check` — the thing this file calls the correctness gate
— **does not typecheck a single test file.**

The measurement, because it is the point: making `RunCircuit.groundCount`
required produced **zero** errors from `pnpm check` and **28** from the same
compiler with tests included. Fixing those 28 left **33 pre-existing errors**
in ten other test files, which have been accumulating unseen for as long as the
exclusion has been there.

**What that means for everything decided today:** a type-level guarantee that
stops at the test boundary is not a guarantee. A fixture can construct a shape
the production code cannot, and a test that compiles only because nothing
compiled it will happily assert against a value the types forbid. The forcing
functions are real in `server/`, `shared/` and `client/src/`, which is where the
three broken mappings lived — and they are absent in exactly the place that is
supposed to be catching things.

**Not fixed, deliberately, and not urgent enough to do badly.** Including tests
means clearing 33 errors across files nobody is otherwise touching, and doing
that in a hurry is how a test gets "fixed" by weakening its assertion. See
`todo.md`. Until then: **when you make something uncompilable, say whether the
tests were part of "everything".**

**Measuring the wrong thing looks exactly like measuring.** The first attempt to
check the re-run behaviour ran the file once against a database that had two
un-backfilled rows in it, saw three rows change, and concluded "it duplicates".
It did not — it was correctly backfilling two marks. The real test was running
it TWICE and looking at the second run, which touched nothing. **A measurement
needs the same suspicion as an assumption: ask what else would produce this
number.**

**A COUNT TAKEN BEFORE THE CHANGE IS INTENT, NOT OUTCOME.** A distinct failure
from the one above, and a quieter one: the number is of the right thing, it is
simply from the wrong moment. Added 2026-09-20.

The backfill rehearsal reported `5 circuit(s) split` and passed. That 5 was
`SELECT COUNT(*) … WHERE conductorCount >= 2`, taken **before** the migration —
a count of rows that COULD be split, printed in the past tense as if they had
been. **A backfill that silently did nothing would have produced the same line
and the same pass**, because unchanged totals are exactly what doing nothing
also produces.

The fix is to measure the same thing on BOTH sides and compare:
`conductors 17 -> 12, grounds 0 -> 5, unsplit 5 -> 0`. That is an outcome. It
cannot be produced by a migration that did not run.

**So, whenever a check reports that something happened:** ask whether the
number was read after the thing it claims to describe. "Rows found", "files
matched", "items queued" and "records to update" are all intent. Outcome is a
before-and-after of the same query — and for a change that is supposed to leave
totals alone, you need both halves, because **"nothing moved" and "nothing
happened" are indistinguishable from one side.**

**A GREP IS A MEASUREMENT, AND IT MEASURES THE PATTERN YOU TYPED.** Added
2026-09-20, from an audit that missed one of the things it was auditing for.
Five numeric fields fell back to `?? 0`; the audit searched for `?? 0` beside a
`value` prop and found four, because the fifth was written
`mode === "flat" ? Number(x ?? 0) : asPercent(Number(x ?? 0))` and the pattern
never appeared where the search expected it. The count was then reported as a
fact — four sites, all accounted for — and a decision was made on it.

**An audit that searches for a shape finds that shape, not the problem.** So:
search for the thing that CANNOT be written differently — here the nullable
column, or the component's own name — rather than the idiom somebody happened
to use. Read every hit rather than counting them. And when an audit reports a
total, say what it searched for, so the next reader can see the gap between the
question and the answer.

**The second way an audit misses: searching the WRONG LAYER for the right
thing.** Later the same day, "is there a way to check what a database has
applied" was answered by reading `server/schemaCheck.ts` and
`server/schemaDrift.test.ts`, concluding there was no runnable check, and
writing one. `scripts/schemaDrift.mts` had existed for days and
`references/deploying.md` § 5 documented it by name.

**Search by the JOB, not by where you expect the code to live.** A thing that
answers your question may be a script, a pnpm task, a test, a router procedure
or a line in a reference file, and looking in the layer you would have written
it in finds only the version you would have written.

**And the sharper half, because it is the one that will happen again:
`scripts/schemaDrift.mts` was in output already on screen.** An `ls scripts/` run
minutes earlier had listed it, and it was read past — because by then the search
was for a function name, and the eye was not looking for a file. A search that
returns the answer and does not deliver it is indistinguishable from a search
that found nothing. **When the conclusion is "this does not exist", re-read what
you already have in front of you before building a second one**; that costs
seconds, and a duplicate costs everybody who later has to work out which of the
two to trust.

**So a plan that states a number should say where the number came from**, and a
number with no source is a question rather than a fact. The measurements that
survive belong next to the code that depends on them: see the table in
`shared/takeoffMarks.ts`, which is there so the next person does not have to
re-measure to know whether the clamp is still right.

### And the same distrust applies to a comment that asserts what the code removes

Found in the same afternoon, in a file written that hour.
`markAppearance` negates the fallback key so that group 8 and assembly 8 cannot
be drawn as the same thing, and the comment said so — while the function it
called used `Math.abs`, which folds them straight back together. The comment
asserted the separation; the arithmetic had removed it.

**That is worse than no comment**, because the next person reads it and stops
looking. A test caught it, which is the only thing that reliably does: a
comment cannot fail. When a comment claims a property — these are kept apart,
this cannot be negative, this is always sorted — **write the test that would go
red if it stopped being true**, and keep them in sight of each other.

### The stronger version: a comment claiming that SOMETHING ELSE handles it

**Added 2026-09-19, after two of them shipped in the same file.** The `Math.abs`
case above is the mild form: the comment and the code that contradicted it were
two functions apart, in one file, and a unit test could reach both.

**The dangerous form is a comment that explains why a guard is ABSENT by
naming code somewhere else.** It is a claim about a part of the system you
cannot see from where you are reading, and it is load-bearing in the worst
direction: it is the reason a check was not written.

Both of these were live in `client/src/pages/TakeoffPage.tsx`, and neither was
found by anything except using the app.

**1. "Nothing else wanted it."** `beginPlainPan` pans the sheet on a plain
left-drag and had no check for whether a tool was armed. The comment said one
was not needed:

> No check for "is a tool armed" is needed, and that is not laziness: while
> tracing or stamping, TraceLayer's overlay takes the event and this never
> fires.

**A React event bubbles.** The overlay handled it AND it arrived here, every
time, from the day it was written. Marking and tracing survived only because a
click that does not move pans by nothing — but boxing a symbol on the legend is
a DRAG, so Capture drew its box while the sheet moved under it, and read as a
tool that had simply stopped working.

**2. "The batch is flushed whenever the tool changes hands."** Marks are sent
in batches and a batch goes over under ONE count id. The comment explained why
reading the id off the first entry was safe:

> Every click in a batch belongs to the armed group, because the batch is
> flushed whenever the tool changes hands — putting the tool down clears the
> queue first.

**Nothing did that.** No flush on disarm, none on a sheet change, nowhere. A
click made in the second after switching counts was counted as the previous
thing — **two wrong quantities, on the screen whose entire job is quantities,
with nothing to show for it.** That is the failure this app is built against,
arriving as a sentence in a comment.

**What makes this class worse than the `Math.abs` one, and it is not the
severity.** There is nowhere to put the test. `vitest.config.ts` covers
`server/**`, `client/src/lib/**` and `scripts/**` — not React components — so a
claim about which layer receives an event, or about what happens when a piece
of state changes, has no assertion that can be written against it here at all.
The rule above says "write the test that would go red". For this class there is
no red to go.

**So the rule is different, and it is stricter:**

- **Do not write a comment that makes a guard unnecessary. Write the guard.**
  `e.stopPropagation()` in the overlay is one line and it is true by
  construction; a paragraph explaining why it is not needed is a bug nobody can
  see. The same goes for "the queue is already empty here" — flush it.
- **If a guard genuinely cannot be written, the comment names the file and the
  line, and you go and read it before you believe it.** A named claim can be
  checked in a minute. "Something upstream handles this" cannot be checked at
  all.
- **Treat the words as a smell:** "never fires", "cannot happen here", "is
  already cleared", "X takes it first", "by the time we get here". Each one is
  an assertion about code that is not on the screen in front of you.
- **And when you find one that was wrong, say so where it was.** Both comments
  above were rewritten to describe what the code now actually does, with the
  wrongness kept in the text — a corrected comment that hides its own history
  teaches nobody.

## A fix can manufacture the fault another fix was for — look at them together

**Two changes that are each correct can be wrong as a pair**, and the pair is
not visible from either diff. Nothing catches this: not `pnpm check`, not a
test that only knows about one of them, not a review of the change in front of
you. Only looking at the finished screen does.

**The worked example, 2026-09-18.** Two items shipped together on purpose:

- **Item 2** made a run's colour mean WHICH TYPE it is, instead of
  conduit-versus-cable. Correct, and the whole point of the change.
- **Item 4** turned the toolbar's conduit and cable icons white, because a
  yellow icon in the toolbar would be teaching a colour code the drawing had
  just stopped using. Correct, and specified for exactly that reason.

Both landed. **And the run rows in the side panel were still tinted conduit
yellow and cable emerald** — a yellow icon sitting beside a pink line, in a
list whose entire job is telling you which line is which. Item 2 had
manufactured, in a second place, the precise fault item 4 existed to remove.

The row's tint had been RIGHT the day before, and the comment above the
constants said why: they were "the same pair the trace layer draws the runs
in", so a row could not disagree with its line. That sentence was true when
written and false by the time the pair shipped. Nothing edited it, which is
what made it invisible — see the section above on a comment that asserts what
the code removed.

**So, when a change alters what something MEANS rather than what it does:**

1. **Grep for every place that encodes the old meaning**, not just the places
   the change touches. Colour, icon, wording, sort order, a legend, a tooltip.
   The dangerous ones are the places that were already correct, because nothing
   in the change points at them.
2. **A comment that explains WHY two things match is a dependency**, and it is
   the cheapest thing to grep for. If it says "the same pair as X", changing X
   is what invalidates it.
3. **Look at the two changes on one screen, at the end.** Not each one as it
   lands. The contradiction here was one screenshot away and no amount of
   reading either diff would have produced it.

**The user's summary is the one to remember:** a fix can manufacture the fault
another fix was for, and the only thing that catches it is looking at the two
together.

## A test fixture shaped like its container tests half the rule

**A fixture that shares the viewport's proportions cannot produce the
in-between state**, so any rule that behaves differently when one axis
overflows and the other does not is untestable against it — and will look fully
covered while being untested.

**The worked example, 2026-09-18.** `clampView` centred the drawing per AXIS,
so at a zoom where a sheet was wider than the pane but shorter than it, sideways
drags panned and vertical drags were silently ignored: one gesture, two
behaviours. `planView.test.ts` had eight assertions on that function,
including a loop over five zooms and six pan distances, and **not one of them
could see the fault.** Every case used the fixture — a 2000x1500 drawing in an
800x600 viewport. **Those are the same 4:3 shape**, so the two axes overflow
together at every possible zoom and the broken state does not exist on that
fixture. The bug shipped past a thorough suite because the suite could only ever
exercise half the rule.

**So: make test shapes differ from the container deliberately.** A 2000x600
sheet in the same 800x600 viewport produces the in-between state at any zoom
between 0.205 and 0.266, and the two failing assertions appear immediately.

**It generalises past viewports.** The same trap is any fixture whose
proportions make two conditions fire together when the code treats them
separately — a container and its content, a page and its margins, a grid and
its cells. **If a rule asks two questions, the fixture has to be able to answer
them differently.** Where a fixture cannot, say so in the test file rather than
leaving the next reader to assume the coverage is real.

## Copying a layout does not copy the behaviour with it

Two similar-looking pieces of UI in two files WILL drift, and the drift shows
up as a wrong number rather than as a broken screen.

The `0 ft 0 in` fault above is the worked example. A settings row and a popover
row displayed the same thing, so the second was written by copying the first's
markup — and the "not set" handling, which was the whole point, stayed behind.
Both screens looked fine. One of them lied.

**So when two places show the same thing, they share the component, not the
shape of it.** `HeightFields` exists for exactly this reason and says so at the
top. A prop for the size difference is cheaper than a second copy of the
behaviour, every time — and when the behaviour later changes, one file changes
rather than one file and one nobody remembered.

The same instinct applies below the UI: `shared/takeoffHeights.ts` merges the
shipped height list with a company's rows in ONE function that both the server
and the client read, because two merges are two chances to resolve the same
height differently.

**And the sharp edge of sharing one component: what EMPTY means changes with
where it is used, so its wording has to be an input, not a constant.** A shared
control cannot decide this for itself, because the two cases are identical in
code and opposite on screen:

- **Nothing is set**, and nothing is being counted. That is a warning, and it
  says so — amber, and the consequence spelled out: "not set — no vertical
  counted".
- **This level is inheriting**, and a real value IS in effect from the level
  above. That is ordinary, not a warning, and the words name what it is
  following: "the job's run height".

Calling the second one "not set" tells the estimator nothing applies when
something does, which is the same wrong-number-shaped fault as showing an unset
height as `0 ft 0 in`. It is the third instance of this root cause in one day,
all from one control reused across levels, which is why it is written down
rather than fixed three times. `HeightFields` takes `unsetLabel` and `setLabel`
for exactly this; anything else that renders an inheritable value needs the
same seam.

## Never `git stash` in this checkout — use `git worktree` instead

**This repo lives inside `OneDrive\Documents`, and the sync client holds file
handles while git is trying to move files.** `git stash` half-completes here.
The documented case (2026-09-18) left the stash entry created, the tracked
modifications still in the working tree, and **the untracked files deleted from
disk** — half-applied in the one direction that loses work.

```bash
git worktree add ../bidrender-check HEAD   # a clean tree in its own directory
```

A worktree is a separate directory, so nothing touches the files being worked
in, and it answers the question stash is usually reached for: _does this happen
without my changes?_

**This note is here rather than only in todo.md because todo.md is a file you
go looking in, and this is needed at the moment you are about to type the
command.** It was written down, in detail, and then reached for anyway on the
same day it was written — which says the location was wrong, not the warning.

**If it has already happened, the work is recoverable**: an untracked file lives
in the stash's third parent, which `git stash show` does not list.
`todo.md` § "Working on this repo — traps" has the four commands, and the
`git diff stash@{0} --stat` check to run before dropping anything.

## Changelog — do this on every meaningful commit

Whenever you commit a meaningful change, **also add a one-or-two-line plain-English entry to `CHANGELOG.md`** describing what changed, in addition to the normal commit message. Do this automatically, as part of the same commit — do not wait to be asked.

- Group entries under a `## [YYYY-MM-DD]` heading, newest date first. Add to today's heading if it already exists; create it if it doesn't.
- Write for a non-programmer reading it months later: what changed and why it matters, not which functions moved. "Fixed a security gap that let any logged-in user read another contractor's bid pricing" beats "added ownership checks to projectItemsRouter".
- Skip it for trivial changes — typo fixes, formatting, comment-only edits.

## Deploying — pushing `main` IS the deploy

**`git push origin main` puts code in front of users, on its own, within about
five minutes.** DigitalOcean App Platform watches `main` and rebuilds on every
push. There is no button afterwards, no dry run, and no branch protection to
stop you.

> **This reversed on 2026-09-16.** It used to be the opposite — pushing did
> nothing and a human pressed Deploy inside Manus. Anything you read anywhere
> describing a Manus session, a sandbox pre-flight or a checkpoint is from that
> era and does not apply.

**Work lands on `local-dev`, which deploys nothing.** It moves to `main` when
someone has decided it should be live. That habit is the only thing between a
routine push and an unplanned deploy, so **ask before pushing `main`
specifically**, not just before pushing.

| Action                      | Effect on the live site                   |
| --------------------------- | ----------------------------------------- |
| Commit locally              | None.                                     |
| `git push origin local-dev` | None. The safe place to put work.         |
| **`git push origin main`**  | **Deploys.** Builds and goes live itself. |

The deploy:

1. **Pre-flight** — `git log main..local-dev --oneline` is the entire change set
   about to go live; read it. Plus `git status --porcelain` (expect empty) and
   `pnpm check`. Note what is live now (`git log --oneline -1 origin/main`), so
   "roll back to what?" has an answer.
2. **Merge and push** — `git merge --ff-only local-dev`, then push `main`, then
   `git checkout local-dev` so the next edit is not on `main`. `--ff-only`
   refusing means `main` has something you have not seen.
3. **Watch DigitalOcean → Activity.** Three to six minutes. Do not walk away: a
   failed build leaves the previous version running, so the site stays up and
   nothing tells you the new code never arrived. **Rollback is a button in that
   same tab**, and it is the fastest way out of a bad deploy.
4. **Run migrations by hand if `drizzle/` changed** — `pnpm db:push`. They do
   **not** ride along with a deploy. A missed one does not crash the app; it
   serves wrong data, and because nearly every read is a bare `select()` it can
   also take a whole screen down with `Unknown column`. Ask the database
   directly with `scripts/schemaDrift.mts`.

   **This step is numbered 4, and the additive half of it belongs at 0.** The
   ADDITIVE files must be applied BEFORE the push and the meaning-changing
   backfills after it — three steps, per file, see the section below. Putting
   all of `drizzle/` here is what took the live site down on 2026-09-20.

5. **Verify the new build is the one running** — `curl -s
https://bidridge.com/api/version` and read `builtAt` against the clock and
   `commit` against what you pushed. **Not the version tag**: `APP_VERSION` is
   typed by hand, read `v6.1` for thirty-three commits, and made this the one
   step of a deploy that passed without checking anything (2026-09-18). The
   build stamp is written by the build, so there is nothing to remember.
6. **A new scheduled job is a separate deploy** — the Cloudflare Worker in
   `workers/cron/` ships with `wrangler` from a local checkout, not by pushing.

`references/deploying.md` is the full version: exact commands, rollback, the
migration traps, verifying secrets reached the deployed environment, and the
outside services the app cannot run without.

## Deploying a migration: THREE STEPS, NOT TWO

```
1. ADDITIVE MIGRATIONS   the new columns, nullable, no defaults
2. DEPLOY THE CODE       it now reads both the old meaning and the new
3. MEANING MIGRATIONS    the backfills that rewrite existing values
```

**Say it as three steps even when step 3 is empty**, and **classify each FILE
rather than the release** — a release normally holds both kinds, and asking
"is this batch additive?" has no correct answer.

**The two-step version of this rule took the live site down on 2026-09-20,
within an hour of being written, applied by the person who wrote it.**
0061–0064 were held back as one batch because two of them changed a meaning;
the two that were plain `ALTER`s went with them, and the deployed code asked
for `groundCount` on a table that did not have it. Every screen touching traced
runs failed until those two were applied.

**Why step 1 exists:** old code ignores a new column, while new code against an
old database dies outright — nearly every read here is a bare `select()`, so a
missing column takes the whole statement and the screen behind it. The database
may be ahead of the code and must never be behind it.

**There is one exception and it is silent.** A migration that rewrites what an
EXISTING column means is not additive, and run in the default order it does not
fail — it reports wrong numbers. 0063 took the ground out of
`takeoff_run_circuits.conductorCount`, and for the minutes before the code that
reads `groundCount` shipped, **every circuit in the app was one conductor short**:
a bid's wire read 125.01 ft, then 83.34 ft, with nothing on screen to say so.

**So, for that kind: the code ships FIRST and the backfill runs after it —
which is step 3, not a different rule.**

**How to tell which kind each FILE is**, in a minute, from the .sql. Ask it of
every file in the release, never of the release:

1. **Does any `UPDATE` write to a column that existed before this batch?**
   No `UPDATE`, or one that only fills a column the same batch added (0055 filling
   0054's `groupId`) — additive, migrate first. An `UPDATE` to a column older than
   the batch (`SET conductorCount = conductorCount - 1`) — **the exception.**
2. **No `UPDATE`? Does the new code need the new column to compute a number it
   was already computing correctly?** If yes, the meaning changed anyway.

**What makes code-first safe is not luck: the code has to read BOTH meanings.**
Add the column NULLABLE with no default so "not yet migrated" is a value nothing
else can produce, and have the code read NULL as the OLD meaning. Then there is
no window in either direction. A `DEFAULT 0` throws that away — "not yet split"
and "deliberately none" become the same value.

**NEVER RUN GENERATED MIGRATION OUTPUT WITHOUT READING WHAT IT ADDS.**
`drizzle-kit generate` diffs against its own SNAPSHOT, not against the database,
and `drizzle/meta/` has no snapshots for the hand-written migrations — so it
re-emits everything since the last one it knows about. On 2026-09-20 a generate
for two new columns produced six `ALTER`s, re-adding three columns already live
in production; it would have died on `Duplicate column name` with nothing
recorded as applied. **A wrong generated migration looks exactly like a right
one.** Read every statement; if it touches anything you did not just change,
throw it away and hand-write it. `pnpm db:push` generates first and carries the
same risk — `npx tsx scripts/migrate.mts` applies without generating.

Full version, with the worked example and the deploy sequence:
`references/deploying.md` § 5, "Which goes first, the migration or the code?".

## Materials — always ship trade slang with a new material

Every material added to the catalog gets `searchAliases` populated with the
terms an electrician would actually type, not just its formal catalog name. This
is not optional polish: a material nobody can find is a material nobody uses. An
estimator searches "1900", "romex", "gem box", "plug" — never "4\" square box",
"12-2 NM-B", "Single-gang box", "Duplex receptacle".

Applies to `BASELINE_MATERIALS` and to any other catalog seeded into
`materials`. When adding one, ask what it is called on a job site, at the
counter, and by the size or colour people call out — then write those down.

The catalog itself lives in `server/seed/materials/*.ts`, one module per family,
with `baselineMaterials.ts` re-exporting it for existing importers. Most of it
is generated — five conduit types × nine trade sizes × five fittings is 225 rows
that differ in two words — so per-family slang is written once in a generator
rather than 225 times by hand. Guidance and worked examples are in
`server/seed/materials/types.ts`.

**Every shipped material costs $0.** A stale estimate is indistinguishable on
screen from a price the user checked, so it can be bid and won on numbers nobody
verified; zero cannot be mistaken for a quote. The Materials screen flags every
unpriced row and filters down to exactly those (`shared/materialPricing.ts`).
Tests must not borrow a shipped price for their arithmetic — price a fixture
material instead, or the test is really asserting the seed data has not changed.

**Renaming a shipped material is not a text edit.** Baseline rows are matched by
name, so changing one inserts a second row and orphans the first, and every
assembly, kit and takeoff stamp points at the original's id. Add an entry to
`RENAMED_BASELINE_MATERIALS` instead, which renames in place. **Removing one is
not a deletion either** — drop it from the catalog and list it in
`RETIRED_BASELINE_MATERIALS`, which sets `isActive = false` so the row leaves
every list but still resolves for bids already priced from it. `pnpm tsx
scripts/dropOrphanBaselines.mts` reports rows that fell out of the catalog
without going through either list; `pnpm tsx scripts/categoryAudit.mts` prints
the curated shelves with their counts.

**Sort order is by category, then by size — never alphabetically.** AWG runs
backwards (18 is thinner than 1), then inverts again at 1/0, then becomes kcmil.
A numeric sort gives 1, 2, 3, 4, 10, 14; a text sort files 4/0 between 4 and 6.
Both look sorted on screen and send an estimator to the wrong row. The order is
an explicit table in `shared/materialSizeOrder.ts`, which also covers raceway
trade sizes, breaker amperages and fixture lengths — do not re-derive any of
them arithmetically. A size is recognised only through its marker (`#`, an
aught, `kcmil`, an inch mark, `ft`, `A`); a bare leading number is not a size,
because `1/2" EMT` and `4 ft LED strip` both start with one.

Rules that keep the aliases useful rather than noisy:

- **Only what the name does not already contain.** "Dimmer" needs no "dimmer".
- **Include the spellings people type**: "12/2" as well as "12-2", "gfi" as well
  as "gfci", "grey" as well as "gray", "jbox"/"j box".
- **Never alias one material to a different material.** A wall plate is not an
  alias for a receptacle. Cross-aliasing devices is exactly what made searching
  "recep" rank "Wall plate" first (fixed in `3ad4db9`); aliases must surface a
  material, never outrank one the query genuinely names. The same rule covers
  accessories: "Cable staple" may be findable by "romex staple", but a bare
  "romex" must return the cable.
- **Do not put a term in both places.** `ALIAS_MAP` expands the item's text as
  well as the query, so a word that a material already carries in
  `searchAliases` gets counted twice if the shared table repeats it — which is
  enough to lift an accessory above the product it serves.

`server/materialsCatalog.test.ts` enforces all of this across the whole catalog:
no restated name words, no aliasing to another material's name, and the ranking
of the searches that must never regress. `pnpm tsx scripts/searchSpotCheck.mts`
prints top hits for a sweep of realistic queries — run it after changing catalog
content, because the common failure is not a missing row but a right row ranked
fourth.

The global `ALIAS_MAP` in `client/src/lib/smartSearch.ts` is a _query-side_
synonym table shared by every search box, and is the wrong place for facts about
one material. Put per-material vocabulary on the material.

## Starter content ships unpriced — materials AND labor

Everything shipped in the starter library costs $0 and is flagged for the user
to replace: materials (`shared/materialPricing.ts`) and labor rates
(`shared/laborRatePricing.ts`) follow the same rule, and any future starter
content with a price should too. A plausible-looking number nobody chose is
indistinguishable on screen from one the contractor set, so it can be bid and
won on. Zero cannot be mistaken for a considered figure.

Labor is the sharper case and gets extra treatment because of it: an unpriced
material understates one line, while the rate multiplies **every** line at once.
That is why the first-run flow asks for a rate before a new user reaches their
first bid, and why `needsRate` reads whichever field actually drives the rate —
a salaried role's `hourlyCost` is always 0 and checking it would call every
salaried role unrated forever.

Tests must not borrow shipped prices or rates for their arithmetic. Price a
fixture, or the test is really asserting that the seed data has not changed.

## Company defaults vs per-bid overrides — say which one you are changing

Overhead, profit and the productivity factor exist at two levels, and the whole
risk is that they look identical. The company-level controls (`/settings/pricing`)
each carry `CompanyDefaultNotice` — the same yellow-triangle panel warning
`LaborRateQuickEdit` uses — because changing one moves every new bid AND every
existing bid still inheriting it. That panel is the reason Settings is six
addressable sections rather than one scroll, and the reason Pricing is the one
you land on: the warning used to sit three sections down a page nobody reached
the bottom of, and a warning that is not read is not being given. The per-bid overrides in
`BidsPage` deliberately carry no such notice: overriding on one bid is an
ordinary local edit, and repeating the warning there teaches people to read past
it in the one place it matters.

**Settings are inherited, not copied.** A bid stores NULL to mean "follow the
company default", so a later change to that default does re-price it. What a
change can never touch is a line's SNAPSHOT — the material cost, hours, rate and
modifier total frozen when the line was added. That boundary is the point, and
`server/companyDefaults.test.ts` asserts both halves of it; do not "fix" the
inheritance into a copy, which would silently freeze every bid at whatever
settings it happened to be created under.

**The productivity factor is not a modifier.** Job-condition modifiers ADD to
each other and describe one job; the productivity factor is applied afterwards
as its own multiplication and describes the company's crews against book hours:
`hours × (1 + summed modifiers) × (1 + productivity)`. Never fold it into the
modifier sum — the breakdown returns `modifierPct`, `productivityPct` and
`hoursAfterModifiers` separately so an estimator can see the two steps apart. It
is applied at calculation time only and writes nothing back, so setting it to 0
returns every number exactly where it was.

## Customization available, but never in the way

**Simple by default, deep when asked.** A screen opens on the few controls most
people need, with everything else one control away. Never the other way round.

The failure this prevents is not a missing feature, it is an unread screen. A
settings panel showing twenty rows gets closed; one showing six and a way to
reach the rest gets used. Both hold the same twenty settings — only one of them
is ever read, and an unread setting is a setting nobody has configured.

**Three rules, and the third is the one that gets skipped:**

1. **The common few are visible, the rest sits behind ONE control.** One, not a
   hierarchy. "Show all", "More", a single disclosure. A second level of hiding
   is a filing cabinet.
2. **Hide OURS, never THEIRS.** Anything the user added stays visible. They
   added it because they use it, and demoting it below a fold to keep our
   shipped list tidy is backwards.
3. **The fold ships before the list needs it.** A disclosure added later, once
   the screen is already crowded, arrives after the screen has taught people
   that this is a crowded screen. Build it while it is hiding two rows so the
   screen is the same shape when it is hiding twelve — and do not delete it as
   dead weight in the meantime.

**A user's own entry behaves exactly like a shipped one.** Same table, same
read, same inheritance, same live re-pricing. One path, not a parallel one for
"custom" things — the moment there are two paths, one of them starts lagging the
other in small ways nobody lists.

The flag that separates them already exists here and is a **NULL `userId`**: an
app-owned row is shared by every company and re-stamped from the seed file on
startup; a company's own row is a fork that the seed never touches
(`server/db.ts`, `seedBaselineMaterials`). That is what makes "reset to the
shipped value" a delete rather than a remembered number, and it is what lets a
later version ship a new entry to every existing company with no migration.

**Retire, never delete.** A library row other rows point at is withdrawn from
every picker and kept, so anything already pointing at it still resolves what it
was priced or measured from (`retireBaselineMaterials`). Deleting it instead
changes a number on somebody's finished work and says nothing.

**Where this already applies:** Settings is seven addressable sections rather than
one scroll; the run panel shows what differs from the defaults and keeps the
rest behind "more" (`references/plan-viewer-overhaul.md` § 6); materials ship as
baseline rows a user forks rather than as a fixed list. The heights screen in
§ 5d of that document is the worked example — six common rows, a fold, an "add
a type", and a user's own type pinned above the fold forever.

## Onboarding — tracked from data, never from page views

The getting-started checklist (`shared/onboarding.ts`) decides every step from
the user's real rows. Never tick a step because a screen was opened: a checklist
that does that walks a new user to the end and leaves them believing they are
set up when they are not, which is worse than showing them nothing.

`users.onboardingCompletedAt` NULL means a brand-new account; the migration that
added the column stamped every existing user so nobody who already uses the app
sees a welcome screen. `checklistDismissedAt` is separate and clears both ways —
"dismissible" is a promise that has to be keepable.

## AI features — two standing rules, before anything else

These two come first because everything below is detail and these two are not.

**Never spend an AI call the user did not ask for.** No AI feature may fire from
a page load, a sheet opening, a tab change, or any other effect. A call is a
button. Auto-read, prefetch, speculative reads and "while we're here" calls are
all the same mistake: the estimator finds out what it cost from the bill. This
is not a cost rule, it is a trust rule — the reader spends the contractor's
money and it has to ask first.

**Manual mode is the product; AI is an accelerator on top of it.** Every job a
bid needs — capturing a symbol, linking it to an assembly, counting, stamping,
tracing a run, calibrating a scale — must be completable by hand, by someone who
has never turned an AI feature on. Not "degrades gracefully when the model
fails" — that is a separate and weaker promise, and it is the one the section
below makes. A feature that only exists in the AI path is not shipped.

Two notes on keeping the second one honest. A local run with
`DISABLE_AI_FEATURES=true` renders a SMALLER app than the live one, so "manual
mode looked fine" tested that way is weak evidence — test with the flag off and
the feature present but untouched. And the manual path is genuinely separate
today: `createSymbolLink` (`server/routers/takeoffStampsRouter.ts`) has no model
call, no allowance check and no AI gate of any kind. Keep it that way; the
moment the manual path needs the reader to have run, the rule is broken.

## AI features — closed action sets, cheapest tier that works

The navigation helper is the pattern to copy. The model never constructs a
destination: it picks an id from `shared/navigationTargets.ts`, and the server
resolves that id against the same list before anything reaches the client, so an
invented target degrades to a text answer rather than a dead link. One list, so
there is no prompt and validator that can disagree.

Pick the model tier by the work: lookup-and-route and alias suggestions run on
the fast tier (`NAVIGATION_MODEL`, `MATERIAL_ALIAS_MODEL`), not the tier
reserved for plan reading (`PLAN_COPILOT_MODEL`). All three are env-overridable,
so a model id that turns out to be wrong is a setting rather than a deploy.
And every AI feature degrades to useful-without-it — no key, a refusal, a
timeout, a malformed reply and a used-up daily allowance all return a graceful
answer, because navigation and search must never depend on an LLM being
reachable.

**Every call goes through `server/llm`, never `server/_core/llm` directly.**
That one door is where the daily limit, the cost line and the provider choice
live, so a feature added later cannot forget them. It talks to Anthropic when
`ANTHROPIC_API_KEY` is set and falls back to the Manus gateway when only that is
configured; `server/llm/anthropic.ts` translates between the OpenAI-shaped
protocol the callers speak and Anthropic's, which is why the routers changed by
one import line rather than being rewritten. Take that file seriously — every
mistake it can make is silent and produces an app that still answers.

**A translation layer that can accept a field and drop it has a type that
LIES, and no amount of care fixes a lying type.** `invokeAnthropic` read six
fields off `InvokeParams` and ignored the rest — `thinking` sat in that gap for
the life of the file, advertised by the type, settable by any caller, and
going nowhere. It was found by accident, while costing something else, because
its only symptom was money. `toolChoice` was in the same position and is
_passed today_ by two callers; it happens not to matter only because `"auto"`
is Anthropic's default anyway, so the change that would have been silently
ignored is the next one somebody makes.

So the adapter now destructures **every** key of `InvokeParams` by name and
asserts the remainder empty. Adding a field to that type without deciding about
it in the adapter is a **compile error**, which is the only version of this rule
that survives contact with a hurry. Same shape as `unhandledBackend` in
`server/storage.ts`. A field with no faithful mapping throws, naming itself,
rather than being forwarded wrong — a mistranslated parameter is worse than a
rejected one because it produces an answer that looks fine, and a throw here is
not a crash, since every AI call site already catches and degrades.

The general rule, for any adapter added later: **do not write a branch that
accepts input and does nothing with it.** If it cannot be honoured, say so
where the mistake is, not where the symptom eventually appears.

**Three cost controls, and they are not equally useful.**

- **`maxTokens` on every call, always.** `invokeAnthropic` refuses a call
  without one; an unbounded reply is the thing that turns a bug into a bill. But
  a cap is a weak cost control: tighten it enough to save real money and you
  start truncating replies, which produces a failed call you still paid for.
  When a cap IS hit, say so in its own sentence — the plan reader checks
  `finish_reason === "max_tokens"` before parsing, because the alternative is
  telling the user their answer "could not be understood", which is true,
  useless, and sends them to re-read the sheet into the same wall.
- **`thinking` is ON unless a caller turns it off, and that is easy to miss.**
  Omitting the parameter does not mean no thinking on the current models — it
  means adaptive thinking runs, billed at the OUTPUT rate and folded invisibly
  into `usage.output_tokens`. The plan reader sends `{ type: "disabled" }`
  explicitly and measured about three cents a sheet for doing so. Any new AI
  feature makes that choice deliberately; if thinking turns out to be worth it,
  `output_config: { effort: "low" }` is the middle setting, not deletion.
- **A daily per-PERSON limit** (`shared/aiLimits.ts`) is what actually controls
  spend. Set generously — it clears the heaviest genuine day and still stops a
  loop in about a minute — because a limit people work around protects nothing.
  Per person rather than per company, so one runaway tab cannot stop a
  colleague working. The refusal message names the number, says when it resets,
  and says what still works; a limit that reads as "the app is broken" costs
  more than the calls it saved.
- **`ai_usage_daily`** counts calls and money per user per day. It stores sizes
  and never contents — no prompt, no question, no drawing text, no reply — so a
  spend report cannot become an archive of what contractors asked about their
  jobs. The same row serves the limit and the admin screen.

**A local run with `DISABLE_AI_FEATURES=true` renders a SMALLER app than the
live one, and that has already produced a wrong conclusion.** The plan reader's
panel is simply absent locally, so the viewer's work pane is several hundred
pixels shorter than a user's — which is why a layout fault that cut the bid
totals in half on the live site could not be reproduced on a dev machine and
looked, honestly, fine. **"It looks right here" is weak evidence for anything
about layout.** Either test with the flag off, or reason about the structure
rather than about what happens to fit today.

**An image has a ceiling, and going past it is silent.** A vision model charges
one token per 28x28 patch and refuses to look at more patches than its budget
allows — so an oversized image is not rejected, it is SHRUNK, and nothing
reports that it happened. `shared/visionImageLimits.ts` does the arithmetic
before anything is sent, and the server tells the client which model it will
call (`planCopilot.state.readerModel`) rather than the client assuming, because
a picture sized for the wrong tier is burnt upload with no symptom. Measured
consequence on a real 36x24 sheet: the old flat 1600px cap delivered 44 pixels
per paper inch and a 7.6-pixel receptacle symbol, where the model would have
looked at 65 and 11 for about half a cent more. Full workings in
`references/ai-reader-cost.md`.

Cost figures come from a local copy of published rates (`shared/aiPricing.ts`)
in millionths of a dollar, because a single call costs less than a cent and
cents would round every one of them to zero. They go stale silently, so say
"indicative" anywhere they are shown: the console has the bill. An unpriced
model records **zero** and logs that it did, rather than guessing — a visible
zero gets fixed and a plausible wrong number does not.

## Editing fields — standing rules for every input

Accuracy is this app's whole value. A contractor who cannot tell whether a
number saved will stop trusting the total, and a wrong total loses a job. So
every field follows the same seven rules, without being asked:

**1. A numeric field selects its value on focus.** Click or tab into a rate,
percentage, quantity or hour count and the existing text is selected, so the
first keystroke replaces it. Nobody should have to clear a field by hand before
typing. Use `onFocus={selectOnFocus}` from `@/lib/selectOnFocus`.

**2. A self-saving field commits on Enter and on blur.** Both, not one, and
both must reach the _same end state_ — see rule 5, which is the half of this
that is easy to miss. In a row or form that stays put, Enter keeps focus and
re-selects, so a column of figures can be typed straight down.

**3. Escape abandons the edit.** The field snaps back to the last _saved_ value
and writes nothing. Escape reverts to what is stored now — not to the text the
edit started from, which goes stale the moment anything saves.

**4. A successful save shows a brief confirmation.** The field itself flashes
green for about a second — border, tint and text together — plus an `aria-live`
announcement for anyone who cannot see colour. The cue lives ON the field rather
than as a floating tick beside it, so a scrolling row cannot clip it and nothing
shifts. Only on a real write: an unchanged value or a reverted one must NOT
flash, because a confirmation for a save that did not happen is worse than no
confirmation at all.

**5. A field inside a panel closes it on Enter.** Rules 2 and 3 were written
with a field sitting in a row, where committing and leaving are the same thing.
They are not the same thing in a popover, dropdown or flyout, which has an
explicit dismiss step — and there, an Enter that saves but leaves the panel open
has done only half of what clicking away does, so the user still has to dismiss
it by hand. That is the exact friction rule 2 exists to remove. So on a panel,
Enter commits **and** closes, and Escape reverts **and** closes. Pass
`onDismiss` to `InlineNumberField` and it does both; the surface it is on is the
only thing that changes. On a panel with several fields, pass `onDismiss` to the
**last** one only — closing after the first of two strands the user outside a
panel they had not finished filling in.

Invalid input reverts rather than erroring — an inline field has nowhere to put
a message, and leaving a bad draft on screen is how someone comes to believe
they saved something they did not. Blank never silently becomes zero unless the
field opts in with `allowEmpty`: a zero quantity prices work at nothing.

### 6. UNSET is not zero, and which one to show is a decision you must name

**Added 2026-09-20, after the same mistake shipped twice.** The job heights
popover rendered `0 ft 0 in` under a caption reading "not set". Two days later
an unset conductor count rendered as `0` — in the field that decides how much
wire gets bought.

**Neither was a careless line. Both were the shortest thing to write**, because
`InlineNumberField` took a `value: number`, so every caller with a nullable
column had to supply something, and `?? 0` is four characters. **Five call sites
did it**, and the fifth hid inside a ternary where an audit for `?? 0` beside a
`value` prop walked past it.

**There is no single right answer, because this app has two opposite
conventions and both are load-bearing:**

- **MONEY — unset renders as 0, and shouts.** An unpriced material IS the one
  showing `$0`, and the Materials screen filters to exactly those. A blank
  there would read as "not applicable" (`references/writing-style.md` § 8).
- **MEASUREMENT — unset must NEVER render as 0.** Zero is a legitimate answer —
  a floor box really is at 0'-0" — so a zero reads as a considered one. A
  length, a height, a count of conductors, a percentage that inherits.

So do not write a rule that picks one. **Name the convention at the call site:**

```tsx
<InlineNumberField value={salary}       whenUnset="zero" … />
<InlineNumberField value={overridePct}  whenUnset={{ placeholder: "company default" }} … />
```

Passing a nullable `value` makes `whenUnset` **required** — the props are a
union, and `number | null` cannot match the member where it is optional. A
caller passing a plain number is unaffected, so nothing had to be swept; what
changed is that nothing new can quietly choose zero.

**`?? 0` in front of a `value` prop is now a smell**, and usually a claim that a
sibling field makes null unreachable — see § "a comment claiming that SOMETHING
ELSE handles it", which is the same failure with a different shape.

**In a draft form with its own Save button, none of this applies** and
`InlineNumberField` is the wrong component: it saves as you type. Hold the null
in the draft and render a blank with a placeholder — `CountField` in
`RunTypePicker.tsx` is the pattern.

**The decision is in `@/lib/inlineEdit`, not in the component, and that is the
point.** `commitNullableEdit` guarantees an emptied box in placeholder mode
never commits a zero, and `vitest` can reach `client/src/lib` while it cannot
reach a React component. A rule with no red to go to is an instruction; a rule
with a failing test is a guard.

### 7. A FORM THAT CANNOT EDIT A FIELD MUST NOT CLEAR IT

**Added 2026-09-20.** A Save button writes what the form is holding. The trap is
a field the form deliberately does not SHOW — hidden because it does not apply
to this shape of thing — being written as null on the way past.

The run-type editor hides the raceway on a cable type, because a cable has no
pipe, and forces it to null on save. That is a GUARD and it is right: a stray
raceway link on a cable is wrong data.

Writing the ground the same way looked symmetrical and was destructive. A
shipped cable legitimately stores two conductors and one ground — that is what
is inside the jacket — and saving through a form that does not show those
fields would have set them to nothing. **Caught by saving a cable type and
reading the row back**, not by reading the code, which looked consistent.

**So decide per field, and state which it is:**

- **A guard** — this value must not exist on this shape of thing. Write the
  null, and say in a comment why the field cannot apply.
- **Not shown** — this form simply does not edit it. **Pass it through
  untouched**, from a draft initialised out of the stored row.

This is the same distinction the routers already make between an OMITTED field
and an explicit `null` — omitted leaves it, null clears it — arriving from the
user-interface side. A form is a patch; the fields it does not mention are
fields it is not changing.

**And a label describing the OLD meaning is worse than no label.** The
conductor count once read "ground included", which was true while one column
counted both and false the moment 0063 split them. A caption that quietly
restates the old meaning beside a number carrying the new one does not merely
fail to help — **it reads as confirmation.** When a meaning changes, the words
around it are part of the change.

**Do not hand-roll this.** `InlineNumberField` (`@/components/InlineNumberField`)
implements rules 1–5 for self-saving numbers; the decisions live in
`@/lib/inlineEdit` and are tested there — `planFieldKey` is the one that knows
what Enter and Escape mean on each surface. For a numeric input inside an
explicit Save/Cancel form, rules 2–4 belong to the form's buttons, but rule 1
still applies — attach `selectOnFocus`.

## Scheduled work — how the archive purge runs

The app has one background job, and it is the template for any future one.
Read this before adding a second.

**Never use `setInterval` or `node-cron`.** A hosted app's instances are stopped
and replaced, so an in-process timer dies with the instance and takes the
guarantee with it. `references/periodic-updates.md` is the full reference; the
short version follows.

A scheduled job is **two pieces that ship separately**:

1. **A handler in the app**, at a path starting `/api/scheduled/`, mounted
   explicitly in `server/_core/index.ts` _before_ the Vite/static fallthrough
   (`/api/scheduled/*` is not auto-registered, and without the explicit mount
   the POST lands on the SPA index and records a cheerful 200 for a job that
   never ran). It authorises with `checkCronSecret` (`server/cronAuth.ts`) and
   must be idempotent, because the caller retries.
2. **The Cloudflare Worker in `workers/cron/`**, deployed once with
   `wrangler deploy` after the site is up. It holds the same `CRON_SECRET`.

**The secret is the whole gate, so three rules are not negotiable.** Compare it
in constant time, never `===` — a comparison that stops at the first wrong
character leaks the secret one character at a time. Refuse when no secret is
configured, rather than waving everything through so a fresh environment "just
works"; that is how a bid-deleting endpoint ends up open on the one host where
the variable was missed. And give every refusal the same answer, so nobody
learns whether the endpoint is protected without ever guessing right.

**Cloudflare cron is FIVE fields, UTC — no seconds.** Manus took six with
seconds leading, so every expression moved. `wrangler.toml` has to restate what
`BACKUP_CRON` / `PURGE_CRON` declare, because TOML cannot import from
TypeScript; `server/scheduledBackup.test.ts` asserts they agree, since a drifted
schedule fires at the wrong time and nothing anywhere reports it.

**A job that needs watching is watched by MEASURING, not by being told.** The
backup's health check (`backup.health`) asks when a backup last actually
succeeded, and the Dashboard says so after two quiet days. A failure-reporting
design catches the failures it knows about and misses the one that matters — a
schedule that was never registered, or that silently stopped, where nothing
fails so nothing is reported and the backups just end. Anything added here with
the same "you only find out when you need it" shape wants the same treatment.

The working example is `server/scheduled/purgeArchivedBids.ts`
(`30 10 * * *`, five fields, UTC). Note the shape it uses, because it is the
shape that makes this testable and safe:

- **The work function is exported separately from the HTTP handler.**
  `purgeExpiredBids(now)` takes the clock as a parameter; the handler passes
  `systemClock()`. A 30-day rule cannot be tested by waiting 30 days, so nothing
  on a deletion path may call `Date.now()` internally — see `shared/retention.ts`
  and `server/bidArchive.test.ts`.
- **Failure points at "keeps too much", never "deletes too early."** If the cron
  is never registered, expired bids simply accumulate and one later sweep clears
  them; the countdown stays accurate throughout. Pick that direction for
  anything destructive.

## Responsiveness — standing rules for new screens

The app is used on a laptop in a truck, one-handed, against a supply-house
deadline. It should feel like a native tool, not a web form. Apply these to any
screen or list you build without being asked:

**1. Edits apply instantly and save in the background.** A simple change — a
price, a name, a quantity, a category — updates the UI the moment the user
commits it, and the mutation goes out behind that. Do not `await` a mutation and
then `await refetch()` before showing the result; that turns a 1-character edit
into a visible stall. Use the React Query optimistic path (`onMutate` writes the
new value into the cache via `utils.<router>.<proc>.setData`, `onError` restores
the snapshot it returned, `onSettled` invalidates). Reserve blocking saves for
operations that genuinely cannot be predicted client-side.

**2. Lists load a window, never the whole table.** Anything that grows with the
user's business — materials, takeoff items, project items, assemblies, plan
pages — is paginated at the query (cursor-based `useInfiniteQuery`, not
`.slice()` on a full fetch) and virtualised in the DOM if it renders long. A
screen that is fine at 28 rows and unusable at 5,000 is a bug, not a future
optimisation. Search and filtering belong server-side for the same reason.

**3. Only genuinely slow work gets a loading indicator.** Spinners on fast
operations read as the app being slow. The bar is roughly: under ~300ms show
nothing, and let the optimistic result stand in. Real work — PDF page rendering
(0.5–13s), plan uploads, bulk imports — gets an honest indicator, ideally with
progress rather than an indeterminate spinner. Prefer skeletons over spinners
for a first load, and never replace already-rendered content with a spinner on
refetch.

**4. Nothing important may sit under the bottom edge.** A screen is a column of
fixed rows around one part that gives, and getting that wrong hides a number
rather than looking untidy. Three rules, each of which has already been broken
once:

- **Height comes from `h-dvh`, never `h-screen`.** `100vh` is the viewport with
  a phone's address bar RETRACTED — the largest it ever gets — so a shell sized
  that way hangs off the bottom by the height of the bar, permanently, and takes
  whatever is pinned to the bottom of a panel with it. `dvh` tracks the real
  height as the bar slides. Same for `min-h-dvh` on a full-page state. And avoid
  `w-screen`: `100vw` does not subtract a vertical scrollbar, which buys
  horizontal overflow, which buys a horizontal scrollbar, which then eats
  pixels off the BOTTOM.

- **In a flex column, exactly one child gives.** That child carries
  `flex-1 min-h-0 overflow-y-auto`; every other child carries `shrink-0`. A
  child with neither cannot be shorter than its own contents, so it pushes
  everything after it out of the window — and because the container clips,
  nothing on screen says there is more. This is what cut the bid totals in half
  in the plan viewer's work pane: the legend slot sat between the scrolling list
  and the pinned totals with no constraint on it. **`min-h-0` is not optional**;
  a flex child defaults to `min-height: auto` and will refuse to shrink without
  it. Prefer ONE scroll region over two stacked ones — two scrollers in a narrow
  column means a wheel that does different things two inches apart.

- **Do not animate the position of a full-height container that clips.** A
  `translateY` on a pane exactly as tall as its parent moves its bottom past the
  clip for the length of the animation — and not only for that long. Animations
  do not advance in a throttled or backgrounded tab, so with `animation-fill-mode:
both` the pane holds the FROM frame indefinitely. A `tab-enter` keyframe that
  slid 6px did exactly this. Fade instead; a fade cannot move anything.

Worth knowing how this gets checked: walk every leaf element on the page and
flag any with text whose bottom is past `innerHeight` with no scrollable
ancestor. That is the test that matches what a user actually loses, and it
found the fault on the one screen that had it and cleared the other thirteen.

These are forward-looking. Screens built before this section predate the rules —
do not retrofit them as a side effect of unrelated work; that is its own task and
its own commit.

## Stored files — two backends behind one socket

Plan PDFs, the legacy per-project PDF and company logos all go through
`server/storage.ts`, which can point at two places: a folder on this machine
(`diskStorage.ts`) or the Cloudflare R2 bucket `bidrender-plans`
(`r2Storage.ts`). Nothing above that file knows which — no router, no client
code, no database column. **Add a third by implementing the same four
operations, not by teaching a router about storage.**

There was a third, the Manus presign proxy, and it was the default before R2
existed. It was removed in v5.141 once the app left that platform: the
credentials it needed only ever existed on Manus infrastructure, so anywhere
else it was a branch that could not run.

**`PLAN_STORAGE` names the backend** (`disk` | `r2`). Unset, the answer is disk
if `LOCAL_STORAGE_DIR` says where, and otherwise an error — there is no store
left to fall back to, and a server that accepts an upload with nowhere to put it
is worse than one that refuses to start. **Do not make it infer R2 from the
presence of credentials.** Credentials arriving in an environment is usually
someone adding a secret for a later step, not a decision to move every
contractor's plans; where files live has to be something a person turned on.
`selectStorageBackend` throws, naming the missing variable, rather than quietly
degrading — a server told to use R2 that used a folder instead would scatter one
contractor's plans across two stores, and the symptom would be plans that open
today and not after the next deploy.

**`/manus-storage/<token>/<key>` is the read route, and the name stays.** It has
nothing to do with Manus any more — it serves disk and R2 — but it is written
into `bid_pdfs.url` and the legacy `projects.pdfUrl` for every file already
stored, so renaming it would break every existing plan link at once. The proxy
is `server/_core/storageProxy.ts`.

**The credentials are `R2_PLANS_*`, never the backup `R2_*`.** Different bucket,
different API token, deliberately: the plans token signs URLs a browser
touches, so if it leaks the backups must still be untouchable. Nothing may fall
back from one to the other, however convenient.

**The object key IS the storage key** — `bid-plans/<user>/<bid>/<file>` — with
no bucket prefix. The backup tool prefixes because it shares a bucket; this one
has a bucket to itself. Adding a prefix later would look harmless and would
orphan every stored file at once, because the key recorded against a bid would
stop naming the object. `r2Storage.test.ts` pins this.

**Switching backends moves nothing that is already stored.** `resolveReadBackend`
falls through to an older store on a miss, so a file written before the switch
still opens while new writes go to R2 — the old stores drain instead of needing
a migration before the switch can happen. Every fallback is a store this server
can actually ask; Manus used to be the last one and was returned on faith,
because there was no cheap way to ask it whether a key existed. With it gone, a
null answer means every configured store was asked and none of them has the
file. The "is it in R2?" answer is cached per key because pdf.js re-requests the
same URL for every byte range, and an uncached check would cost a billable HEAD
hundreds of times per plan set.

**Testing against the real bucket locally:** `pnpm dev:r2`. It borrows only the
`R2_PLANS_*` lines from `.env.production.local` and drops everything else in
that file — `DATABASE_URL` above all. `pnpm dev` does not load that file at
all, deliberately, so no local run can point itself at the live database; the
filter in `scripts/loadPlansEnv.mts` is what keeps that true while borrowing,
and it is tested for exactly that. `pnpm r2:ls` lists what is actually in the
bucket.

A cross-origin PUT is always preflighted, so the bucket needs a CORS rule for
the app's origin. Without one the client falls back to the same-origin route in
`planUpload.ts`, which works but is capped by the platform's request body limit.
The rule must also **expose the `ETag` header** — an upload in pieces cannot be
reassembled without the receipt R2 returns for each piece.

## Large plan sets — pieces going up, byte ranges coming down

`MAX_PDF_BYTES` is 2GB, and that number is only real on R2. Two things make it
so, and **neither may be quietly undone by a change that only looks at one end**.

**Going up: pieces, and R2 is the memory.** Above 64MB a file is cut into equal
16MB pieces (`shared/multipartPlan.ts`), four in flight, each signed by the
server and sent browser→R2. Resuming asks R2 which pieces it holds —
**never a local record of what was sent**. That distinction is the whole design:
a local note is wrong in exactly the case resuming exists for, a connection that
died mid-piece, and acting on a wrong note completes a file that is corrupt. A
corrupt plan set is worse than a failed upload because nothing says it happened.
Equal-sized pieces are an R2 rule, not a preference, and they are what make a
piece number map to a byte range by arithmetic.

**Coming down: one long-lived link, and it must be byte-identical.**
`planViewerUrl` hands pdf.js a 12-hour signed R2 link so page loads skip this
server entirely. `viewerUrlWindow` pins the signing time AND the expiry to a
fixed boundary so re-minting inside the window returns the same string. Pinning
only the expiry is the easy mistake — the signature covers `X-Amz-Date`, so the
url would still differ every second, and since the viewer reloads the document
whenever `doc.url` changes, every background refetch would silently restart an
open plan. Same reasoning as `storageTokenExpiry`.

**A signed url is a bearer credential.** Never log one, never store one in a
column, never put one in the address bar. It outlives the session in a log file
and is readable by anyone who can read logs.

**Above 50MB pdf.js stops downloading the rest of the document in the
background** (`shared/pdfRangeLoading.ts`). Below it, prefetching is free and
makes later pages instant; above it, it is a gigabyte competing with the page
being drawn.

**A size column has to be BIGINT.** `bid_pdfs.byteSize` was `int`, which tops
out one byte under 2GB — so a 2GB set uploaded perfectly and then failed to
attach, after the transfer rather than before it. Anything new that records a
file size needs the same treatment.

`pnpm dev:r2` plus a real several-hundred-MB PDF is the only way to exercise
this properly; the pure modules carry the cases that can be written down.

**The backup reads plans with a THIRD token, and the reason is not obvious.** An
R2 token's permission level applies to the whole token, not per bucket — so one
credential able to read `bidrender-plans` and write `bidsoftware` would also
have write access to every contractor's plans. So `R2_PLANS_READONLY_*` is
Object Read only on the plan bucket, the backup streams down with it and up with
`R2_*`, and the bytes pass through the backup host rather than being copied
inside Cloudflare. That costs bandwidth and buys a copying credential that
cannot alter or destroy a plan. **`R2_PLANS_*` must never gain access to the
backups** — it signs URLs a browser touches.

**Nothing on the backup's file path may buffer a whole file.** `putStream` and
`FileStreamSource` exist so a 2GB plan is handed from source to destination a
few MB at a time; the small SQL dump and manifest keep the plain Buffer `put`
because routing them through a multipart uploader is machinery for no benefit.
Measured on a real 400MB object the process grows by 9MB, and
`server/backupStreaming.test.ts` asserts only one chunk is ever live — which is
what would catch someone quietly reintroducing `await collect(stream)`.

## Architecture

**Stack:** Express + tRPC (v11, superjson transformer) on the server, React 19 + Vite + Wouter (hash-based routing) on the client, Drizzle ORM against MySQL. Single dev process — Vite runs as Express middleware in development (`server/_core/vite.ts`), and the client is served statically in production.

**`_core/` directories are platform scaffolding**, generated by the Manus WebDev template — `server/_core/`, `client/src/_core/`. They handle the JWT session token and its cookie (`sdk.createSessionToken` / `sdk.verifySession`, `cookies.ts`), tRPC boilerplate (`trpc.ts`, `context.ts`), the route that serves a stored file (`storageProxy.ts` — see § Stored files), and scheduled/cron callback wiring. Prefer extending app-level code over rewriting `_core` internals; `references/periodic-updates.md` documents the cron system in detail if that's ever needed.

**Signing in is NOT in `_core`, and this is the sentence to get right.** Email and password with bcrypt, in our own `users` table — `server/routers/authRouter.ts` (`signup`, `login`, `changePassword`), shipped in v5.127/5.128. It moves with the database and needs no outside service. `_core` issues the session cookie afterwards; it does not decide who you are. The OAuth path in `_core/oauth.ts` and `_core/sdk.ts` still compiles but nothing app-level imports it.

This matters because the older version of this note said `_core` handled OAuth login, and `references/deploying.md` § 8 calls the belief behind it the single most expensive wrong sentence in these docs: it is the line someone reads to size a hosting move, and it makes a done job look like "first build a login system". Anything claiming this app needs an OAuth server is from the Manus era.

**Auth:** email and password (`users.passwordHash`, `users.loginMethod` — both live columns, not vestigial). `sdk.authenticateRequest` (`server/_core/sdk.ts`) resolves the session cookie (or `Authorization: Bearer` fallback) to a `User` row; the row itself is created by `authRouter.signup`, not on first request. The OAuth branch in there still tries to sync an unknown `openId` from an OAuth server, which is why an invented `openId` fails with `Failed to sync user info` rather than being provisioned. tRPC procedures come in three tiers (`server/_core/trpc.ts`): `publicProcedure`, `protectedProcedure` (any logged-in user), `adminProcedure` (`user.role === "admin"`). Client-side gate is `AuthGuard` in `App.tsx`.

**Data model** (`drizzle/schema.ts`) — everything is scoped by `userId` with cascade deletes:

**THE LIVE MODEL:**

- `materials` — the catalog. 629 shipped rows plus the user's own; `costPerUnit`,
  `unitOfSale` (each/foot/box), category, search aliases. Seeded from
  `server/seed/materials/*`.
- `assemblies` / `assembly_materials` / `assembly_modifiers` — a reusable recipe:
  components with quantities, plus `baseLaborHours` and `overheadLaborHours`
  typed on the assembly itself and a `laborRateId` for the role that does it.
- `labor_rates` — hourly cost per role.
- `bids` — one job. `bid_pdfs` holds its plan sets; the takeoff tables
  (`takeoff_groups`, `takeoff_stamps`, `takeoff_runs`, `takeoff_run_types`) hang
  off the bid and its sheets.
- `bid_line_items` — what is ON the bid, with the four pricing inputs SNAPSHOT
  at add time (`snapshotMaterialCost`, `snapshotLaborHours`,
  `snapshotModifierPct`, `snapshotLaborRate`). A line may point at a
  `takeoffGroupId`, and then its QUANTITY is derived live from the marks while
  its pricing stays frozen — see `shared/takeoffBridge.ts`. **Never mutate a
  snapshot field; that freeze is what stops last week's bid re-pricing itself.**

**THE LEGACY MODEL — still in `drizzle/schema.ts`, read by nothing a user can
reach. Do not build against it.**

`masterItems` / `masterAssemblies` / `masterAssemblyItems` / `masterLaborRates`,
`projectAssemblies` / `projectAssemblyItems`, `projectItems`, `bidSummary`. Each
still has query functions in `server/db.ts` and some have routers; **measured
2026-09-20, every one of them has ZERO references in `client/src`**, against 41
files for `bids`, 27 for `materials` and 26 for `assemblies`. They are the
four-workspace design whose screens were deleted (see the note further down).

**This section described the legacy model as the current one until 2026-09-20,
and that is the most expensive kind of error this file can hold.** It is loaded
into every session, so it was not a stale note somebody might catch — it was the
first answer anybody got. It also hid a real capability: `master_items` carried
`masterLaborHours`, a default labor unit per catalog item, with
`overrideLaborHours` on the per-bid line. That was decided and built, and the
replacement catalog dropped it with nothing recording the loss — so the written
record simultaneously described a model that no longer existed HERE and a plan
that had never been built THERE (`ASSEMBLIES_PLAN.md`). Finding out which was
true meant reading the schema.

**The rule: when a rewrite replaces a model, the old entry says what replaced it
on the same day.** A replacement documented only in its own file is
indistinguishable from a plan that never included what it dropped.

**Feature availability is decided by access tier**, not by a flags table: `users.accessTier` (`standard` | `internal`) against the `FEATURES` map in `shared/permissions.ts`, resolved server-side into `scope.features` and read client-side through `useCompany().hasFeature(key)`. The `featureFlags` table and its admin toggles are retired — nothing reads them, and the table survives in `drizzle/schema.ts` only so drizzle-kit does not queue a `DROP TABLE`. Gate a new unreleased feature by adding it to `FEATURES` with `availability: "internal"`; there is no flag row to create.

tRPC routers live in `server/routers/*Router.ts` and are composed in `server/routers.ts`; DB access goes through query functions in `server/db.ts` (no ORM calls directly inside routers).

**Client structure:** `client/src/pages/BidRenderShell.tsx` is the app shell — a hand-rolled hash router rather than Wouter's route matching, because navigation state also drives the sidebar. `contexts/AppContext.tsx` holds the UI scale and nothing else; theme in `contexts/ThemeContext.tsx`. tRPC client setup is in `lib/trpc.ts`.

**The route model is `client/src/lib/appRoutes.ts`, not the shell.** `pathToRoute` / `routeToPath` / `retiredAddress` are pure functions with `appRoutes.test.ts` against them, and that is deliberate: the sidebar carries **eight** destinations, down from fourteen, because several screens were folded into others as `?view=` tabs — Kits and Modifiers into Assemblies, Supplier Pricing into Materials, the Bids list and Quick bid's chooser into the Dashboard.

Settings is seven addressable panels at `/settings/:section` (`SETTINGS_SECTIONS`), not one scroll — link to the panel, never to `/settings` and a scroll position.

A bid carries three surfaces of its own — `/bids/:id/plans`, `/bids/:id/count`, `/bids/:id/proposal` — and **none of them is in the nav, deliberately**: each needs a bid, so a top-level entry would dead-end on "which one?". That is the fault that removed Bids and Quick bid from the sidebar; both were pages whose whole job was asking which bid you meant. When a screen needs a bid, reach it from the bid.

Folding a screen retires its address, and **a retired address is what breaks silently** — an unrecognised path lands on the Dashboard, so nobody notices until they wonder where their kits went. So every one is listed in `RETIRED_PATHS` and redirected to the screen that took the job over, with the address bar rewritten via `replaceState` so bookmarks heal. When you move a screen:

- add its old address to `RETIRED_PATHS` (never rely on the catch-all);
- update `shared/navigationTargets.ts`, whose paths the AI helper hands to users as links;
- check `shared/onboarding.ts`, which hard-codes four hrefs.

`appRoutes.test.ts` cross-checks the last two against the router, because neither module can see it. Note that navigation targets may now share a `path` — one screen legitimately answers to several vocabularies ("the dashboard" and "my bids") — so it is the **ids and labels** that must stay unique, not the paths.

The original four-workspace design (Residential / Commercial / Civil / Industrial estimating tabs, each with its own named projects and calculator state) is **gone**, along with the screens that read it — `ExportButton`, `PlanPanel`, `PlanViewer`, `AIChatBox`, `DashboardLayout`, and the `pages/tabs/` project screens built on the legacy `master_*` tables. Don't reintroduce per-workspace client state; a bid is the unit of work now.

**PDF plan viewer pipeline** (the most performance-sensitive part of the client):

- Rendering happens in `client/src/workers/pdfRenderer.worker.ts` — a dedicated Web Worker that owns the pdfjs instance, so `page.render()` (0.5–13s on dense drawings) never blocks the main thread. ImageBitmaps transfer back zero-copy.
- `TakeoffPage` loads a plan by **URL**, so pdfjs pulls byte ranges straight from storage and a large sheet set never lands in the tab's memory whole. A full download is kept only as a fallback for gateways that refuse range requests. S3 is the source of truth; there is no client-side binary cache, and the IndexedDB layer the old `PlanPanel` used is gone.
- Plan URLs are signed and expire — `lib/planUrlRefresh.ts` tells an expired URL apart from a broken plan so the screen asks for a fresh one instead of reporting failure.
- Page thumbnails/overview render progressively in the background as bitmaps arrive; don't reintroduce synchronous/ref-callback thumbnail generation.

**Path aliases** (`@` → `client/src`, `@shared` → `shared`) are declared in three places that must stay in sync: `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`.

**Conventions:** Prettier enforced (double quotes, semicolons, 2-space indent — see `.prettierrc`); TypeScript strict mode; no ESLint. Commit messages in this repo are versioned checkpoints (`vX.YY`) summarizing what shipped and which GitHub issues they close — follow that style when asked to commit.

**Line endings are LF, and `.gitattributes` is what keeps them that way.** Git on Windows is usually configured `core.autocrlf=true`, which checks every text file out as CRLF, while `.prettierrc` sets `"endOfLine": "lf"`. With nothing reconciling the two, prettier reported every tracked file as unformatted no matter how often it was run, and `pnpm format` produced 80+ files of churn on top of whatever was actually being changed — which made the command unusable and the check worthless. `* text=auto eol=lf` settles it. Don't remove it, and don't "fix" a CRLF diff by changing `.prettierrc`. A `.bat` or `.cmd` file, if one is ever added, needs an explicit `eol=crlf` — cmd.exe will not run an LF-terminated batch file.

`drizzle/meta/` is in `.prettierignore`: those snapshots are written and rewritten by `drizzle-kit`, so formatting them is churn that never settles.
