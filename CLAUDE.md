# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

HelixBid — a trade-contractor bid/estimating tool. Users build a personal catalog of materials and labor rates, assemble them into reusable assemblies, attach them to project bids, and upload plan PDFs to take off quantities against a live crosshair viewer.

**Electrical-first by sequencing, not electrical-only by design.** Multiple trades are in the data model from the ground up: every assembly carries a `trade` (`drizzle/schema.ts`, defaulting to `"electrical"`), and a bid carries a `trades` array — one bid may mix line items from several unlocked trades. Unlocking is gated at the app layer rather than in the schema, deliberately, so a new trade needs no migration. Electrical is simply the first trade to ship, which is why the seeded catalog, the trade slang and the starter assemblies are all electrical today. Do not read that focus as a constraint and bake an electrical-only assumption into anything new — adding plumbing or HVAC should be content plus an unlock, not a refactor.

`trade` is a different axis from `projectType` (residential/commercial/both), which is only a filter on the assembly library. The schema says so explicitly; do not wire the two together.

The project was called **BidPhase** until v5.75, and the GitHub repo was renamed to match on 2026-08-12. Only the local checkout directory still carries the old name. Anywhere else, "BidPhase" is either stale or a historical record — `todo.md` entries below v5.75 are the latter and stay as written.

## Commands

```bash
pnpm dev              # start dev server (tsx watch, Vite middleware) — NODE_ENV=development
pnpm build            # vite build (client) + esbuild bundle (server) -> dist/
pnpm start            # run production build (NODE_ENV=production)
pnpm check            # tsc --noEmit — run after any nontrivial change
pnpm test             # vitest run (server/**/*.test.ts only — see vitest.config.ts)
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

## Deploying — GitHub is the source of truth, Manus pulls from it

**Pushing to GitHub does not deploy anything.** There is no pipeline between
the two: no CI, no build hook, no deploy config, and GitHub is the only git
remote. The live site is deployed from the **Manus project's own copy** of this
repo, by a human clicking **Deploy** in the Manus UI.

That gap is not theoretical — it has already caused one silent divergence. The
project was originally built inside Manus (the `Checkpoint:` commits, up to
`ff469cb` on 2026-08-10), and the work then moved to a local checkout driven by
Claude Code. Every commit after `ff469cb` reached GitHub and nothing else, so
the live site kept serving the old build while `main` moved 51 commits ahead.
Nothing was broken; the two copies simply had no reason to meet.

**The direction is fixed: GitHub → Manus, never the reverse.** The local
checkout plus GitHub is where real work happens. Manus is a deployment target
that pulls, not a place to edit. Editing in the Manus workspace re-opens the
same divergence from the other side — if it happens anyway, push that work to
GitHub before deploying, never merge GitHub into it.

Before every deploy, in a Manus session:

1. **Check for anything Manus has that GitHub does not** — `git status` and
   `git log origin/main..HEAD` in the sandbox. Expect both to be empty. If they
   are not, stop: that is unpushed work, and pulling will bury it.
2. **`git pull origin main`** — this is the bridge that does not otherwise exist.
3. **`pnpm db:push`** — apply pending migrations **before** deploying, not after.
   A skipped migration does not crash the app; it starts, serves pages and shows
   wrong data, which is the expensive way to find out (see § Commands).
4. **Save a checkpoint**, then **Deploy**.
5. **Verify a feature that needs the platform** — the navigation helper is the
   cheapest probe, because it exercises `BUILT_IN_FORGE_API_KEY`, which only
   exists on deployed infrastructure and never locally.

`references/deploying.md` has the same sequence with the exact commands, the
platform services the app depends on, and what to check when a deploy looks
like it worked but didn't.

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

## AI features — closed action sets, cheapest tier that works

The navigation helper is the pattern to copy. The model never constructs a
destination: it picks an id from `shared/navigationTargets.ts`, and the server
resolves that id against the same list before anything reaches the client, so an
invented target degrades to a text answer rather than a dead link. One list, so
there is no prompt and validator that can disagree.

Pick the model tier by the work: lookup-and-route runs on the fast tier
(`NAVIGATION_MODEL`, env-overridable), not the tier reserved for plan reading.
And every AI feature degrades to useful-without-it — no key, a refusal, a
timeout and a malformed reply all return the same graceful fallback, because
navigation and search must never depend on an LLM being reachable.

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

**Never use `setInterval` or `node-cron`.** The app runs on Cloud Run, which
terminates idle instances, so an in-process timer dies with the instance and
takes the guarantee with it. `references/periodic-updates.md` is the full
reference; the short version follows.

A scheduled job is **two pieces that ship separately**:

1. **A handler in the app**, at a path starting `/api/scheduled/`, mounted
   explicitly in `server/_core/index.ts` _before_ the Vite/static fallthrough
   (`/api/scheduled/*` is not auto-registered, and without the explicit mount
   the platform's POST lands on the SPA index). It authenticates with
   `sdk.authenticateRequest` and refuses anything without `user.isCron`. It must
   be idempotent — the platform retries 5xx/429 three times.
2. **The cron itself, created on the Manus platform**, once, from a sandbox
   terminal _after the site is deployed_ — a dev machine is unreachable from the
   platform, so this cannot be done from a local checkout. The exact command is
   in the handler's header comment.

The working example is `server/scheduled/purgeArchivedBids.ts`
(`0 30 3 * * *`, six fields with seconds first, UTC). Note the shape it uses,
because it is the shape that makes this testable and safe:

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

These are forward-looking. Screens built before this section predate the rules —
do not retrofit them as a side effect of unrelated work; that is its own task and
its own commit.

## Architecture

**Stack:** Express + tRPC (v11, superjson transformer) on the server, React 19 + Vite + Wouter (hash-based routing) on the client, Drizzle ORM against MySQL. Single dev process — Vite runs as Express middleware in development (`server/_core/vite.ts`), and the client is served statically in production.

**`_core/` directories are platform scaffolding**, generated by the Manus WebDev template — `server/_core/`, `client/src/_core/`. They handle OAuth login, JWT session cookies, tRPC boilerplate (`trpc.ts`, `context.ts`), S3-backed file storage via a Forge presign proxy (`storage.ts`, `storageProxy.ts`), and scheduled/cron callback wiring. Prefer extending app-level code over rewriting `_core` internals; `references/periodic-updates.md` documents the cron system in detail if that's ever needed.

**Auth:** OAuth-only (no local password flow is wired up despite `passwordHash` existing on the `users` schema). `sdk.authenticateRequest` (`server/_core/sdk.ts`) resolves the session cookie (or `Authorization: Bearer` fallback) to a `User` row, auto-provisioning on first login. tRPC procedures come in three tiers (`server/_core/trpc.ts`): `publicProcedure`, `protectedProcedure` (any logged-in user), `adminProcedure` (`user.role === "admin"`). Client-side gate is `AuthGuard` in `App.tsx`.

**Data model** (`drizzle/schema.ts`) — everything is scoped by `userId` with cascade deletes:

- `masterItems` / `masterAssemblies` / `masterAssemblyItems` / `masterLaborRates` — the user's reusable catalog (a "master assembly" is a named group of master items with quantities).
- `projects` — one bid. Carries its own PDF plan reference (`pdfUrl`/`pdfKey`/`pdfFilename`, uploaded to S3) alongside bid metadata (customer, address, status).
- `projectAssemblies` / `projectAssemblyItems` — master assemblies _copied_ into a project as a snapshot (`masterMaterialCost`/`masterLaborHours` frozen at add-time) plus separate `override*` fields the user edits per-bid. Never mutate the snapshot fields after creation; write to the override fields instead.
- `projectItems` — standalone items added directly to a project outside any assembly, same override pattern.
- `bidSummary` — one row per project holding global labor/markup multipliers (`percentageLaborFactor`, `lumpSumHours`, `markupPct`) and the default labor rate to price against.

**Feature availability is decided by access tier**, not by a flags table: `users.accessTier` (`standard` | `internal`) against the `FEATURES` map in `shared/permissions.ts`, resolved server-side into `scope.features` and read client-side through `useCompany().hasFeature(key)`. The `featureFlags` table and its admin toggles are retired — nothing reads them, and the table survives in `drizzle/schema.ts` only so drizzle-kit does not queue a `DROP TABLE`. Gate a new unreleased feature by adding it to `FEATURES` with `availability: "internal"`; there is no flag row to create.

tRPC routers live in `server/routers/*Router.ts` and are composed in `server/routers.ts`; DB access goes through query functions in `server/db.ts` (no ORM calls directly inside routers).

**Client structure:** `client/src/pages/HelixBidShell.tsx` is the app shell — a hand-rolled hash router rather than Wouter's route matching, because navigation state also drives the sidebar. `contexts/AppContext.tsx` holds the UI scale and nothing else; theme in `contexts/ThemeContext.tsx`. tRPC client setup is in `lib/trpc.ts`.

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
