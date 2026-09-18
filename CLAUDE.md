# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

BidRidge — a trade-contractor bid/estimating tool. Users build a personal catalog of materials and labor rates, assemble them into reusable assemblies, attach them to project bids, and upload plan PDFs to take off quantities against a live crosshair viewer.

**Electrical-first by sequencing, not electrical-only by design.** Multiple trades are in the data model from the ground up: every assembly carries a `trade` (`drizzle/schema.ts`, defaulting to `"electrical"`), and a bid carries a `trades` array — one bid may mix line items from several unlocked trades. Unlocking is gated at the app layer rather than in the schema, deliberately, so a new trade needs no migration. Electrical is simply the first trade to ship, which is why the seeded catalog, the trade slang and the starter assemblies are all electrical today. Do not read that focus as a constraint and bake an electrical-only assumption into anything new — adding plumbing or HVAC should be content plus an unlock, not a refactor.

`trade` is a different axis from `projectType` (residential/commercial/both), which is only a filter on the assembly library. The schema says so explicitly; do not wire the two together.

The product is **BidRidge**. It was called **BidPhase** until v5.75, **HelixBid** until v5.119 (renamed because HelixBid clashed with an existing company), and **BidRender** until v6.1. `bidridge.com` is registered and trademark clearance came back clear.

**The v6.1 rename was deliberately user-visible ONLY, and the split is the point.** What a person reads now says BidRidge: the wordmark, the tab title, on-screen copy, the landing page, exported filenames. What only a machine reads still says `bidrender`, on purpose — the repo and local folder, the database `bidrender` and login `bidrender_app`, the buckets `bidrender-plans` and `bidsoftware`, the `R2_PLANS_*` names, the DigitalOcean app, the Cloudflare worker `bidrender-cron`, the `BidRenderShell` component, and `package.json`'s `name`. Several of those are baked into stored rows or live infrastructure, and renaming them is churn with real risk and no user benefit. **Do not "finish the job" by renaming them.**

**Domains and URLs are untouched and are their own task** — `bidrender.com` still serves the app, so the sign-in page reads BidRidge while the address bar reads bidrender.com. That gap is expected, not a bug to fix in passing.

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
5. **Verify the new build is the one running** — the version tag in the sidebar
   footer (hover) reads `APP_VERSION`; an older number means the deploy did not
   take.
6. **A new scheduled job is a separate deploy** — the Cloudflare Worker in
   `workers/cron/` ships with `wrangler` from a local checkout, not by pushing.

`references/deploying.md` is the full version: exact commands, rollback, the
migration traps, verifying secrets reached the deployed environment, and the
outside services the app cannot run without.

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
every field follows the same five rules, without being asked:

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

**Do not hand-roll this.** `InlineNumberField` (`@/components/InlineNumberField`)
implements all five for self-saving numbers; the decisions live in
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

- `masterItems` / `masterAssemblies` / `masterAssemblyItems` / `masterLaborRates` — the user's reusable catalog (a "master assembly" is a named group of master items with quantities).
- `projects` — one bid. Carries its own PDF plan reference (`pdfUrl`/`pdfKey`/`pdfFilename`, uploaded to S3) alongside bid metadata (customer, address, status).
- `projectAssemblies` / `projectAssemblyItems` — master assemblies _copied_ into a project as a snapshot (`masterMaterialCost`/`masterLaborHours` frozen at add-time) plus separate `override*` fields the user edits per-bid. Never mutate the snapshot fields after creation; write to the override fields instead.
- `projectItems` — standalone items added directly to a project outside any assembly, same override pattern.
- `bidSummary` — one row per project holding global labor/markup multipliers (`percentageLaborFactor`, `lumpSumHours`, `markupPct`) and the default labor rate to price against.

**Feature availability is decided by access tier**, not by a flags table: `users.accessTier` (`standard` | `internal`) against the `FEATURES` map in `shared/permissions.ts`, resolved server-side into `scope.features` and read client-side through `useCompany().hasFeature(key)`. The `featureFlags` table and its admin toggles are retired — nothing reads them, and the table survives in `drizzle/schema.ts` only so drizzle-kit does not queue a `DROP TABLE`. Gate a new unreleased feature by adding it to `FEATURES` with `availability: "internal"`; there is no flag row to create.

tRPC routers live in `server/routers/*Router.ts` and are composed in `server/routers.ts`; DB access goes through query functions in `server/db.ts` (no ORM calls directly inside routers).

**Client structure:** `client/src/pages/BidRenderShell.tsx` is the app shell — a hand-rolled hash router rather than Wouter's route matching, because navigation state also drives the sidebar. `contexts/AppContext.tsx` holds the UI scale and nothing else; theme in `contexts/ThemeContext.tsx`. tRPC client setup is in `lib/trpc.ts`.

**The route model is `client/src/lib/appRoutes.ts`, not the shell.** `pathToRoute` / `routeToPath` / `retiredAddress` are pure functions with `appRoutes.test.ts` against them, and that is deliberate: the sidebar carries **eight** destinations, down from fourteen, because several screens were folded into others as `?view=` tabs — Kits and Modifiers into Assemblies, Supplier Pricing into Materials, the Bids list and Quick bid's chooser into the Dashboard.

Settings is six addressable panels at `/settings/:section` (`SETTINGS_SECTIONS`), not one scroll — link to the panel, never to `/settings` and a scroll position.

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
