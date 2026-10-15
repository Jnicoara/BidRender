# App-wide copy review — 2026-10-14 (overnight, Track C)

A read-only sweep of every `.tsx` under `client/src/pages` and
`client/src/components` (JSX text, attribute strings, string literals;
comments, class names and `components/ui/` left out), then the clear fixes
made by hand. 46 findings; what was searched is under each heading so the
gaps are visible.

## Fixed tonight

| Was                                                                                                                                                      | Now                                                                                                                                                                                                              | Where                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| "You are **an viewer**"                                                                                                                                  | "You are **a** viewer / **an** estimator"                                                                                                                                                                        | `TeamPage`                                               |
| "archived **assemblys** stay recoverable"                                                                                                                | "archived **ones** stay recoverable"                                                                                                                                                                             | `LibraryRemovalDialogs`                                  |
| Crew › "What your role covers" listed codes: `bids.view`, `members.manage` …                                                                             | Plain words from `CAPABILITY_LABEL` (a `Record` over every capability — a new one will not compile without words)                                                                                                | `TeamPage`, `shared/permissions.ts`                      |
| Role names "estimator", "viewer", "suspended"                                                                                                            | "Estimator", "Viewer", "Suspended" (`roleLabel`)                                                                                                                                                                 | `TeamPage`                                               |
| Example-rate tag: "Set your own loaded rate in **Settings › Labor rates**" (no such place)                                                               | "…on the **Labor rates screen**"                                                                                                                                                                                 | `ExampleTags`                                            |
| "Add some on the **Modifiers screen** first"                                                                                                             | "…on the **Modifiers tab of Assemblies** first"                                                                                                                                                                  | `AssembliesLibraryPage`                                  |
| "…gets one in Labor Rates." / breadcrumb "Labor Rates"                                                                                                   | "on the Labor rates screen" / "Labor rates"                                                                                                                                                                      | `BidsPage`, shell                                        |
| "Sign Out", "Delete Forever", "customised", tooltip "Admin settings"                                                                                     | "Sign out", "Delete forever", "customized", "Admin"                                                                                                                                                              | Settings, Modifiers, LibraryControls, shell              |
| Three ways to say it: "for good?" + "Delete permanently" / "forever" / tooltip "Delete permanently"                                                      | "Delete … forever?" + "Delete forever" everywhere                                                                                                                                                                | BidArchive, Materials, Assemblies, Kits                  |
| **Archive vs Recently deleted** — Dashboard "Archive 1", Bids "Archive", archive dialog "moves to the Archive", page "Archive", trash link "Bid archive" | "Recently deleted" is the one place: the Dashboard/Bids buttons say it and open it; the dialog says "moves to Recently deleted"; the bids-only page is "Deleted bids" (Back → Recently deleted); "Nothing here." | Dashboard, BidList, archiveBid, BidArchive, Trash, shell |
| "The pricing engine refused this line."                                                                                                                  | "This line can't be priced — open it to see what's missing."                                                                                                                                                     | `LineCost`                                               |
| "priced from the snapshot taken when each was added"                                                                                                     | "each priced as it was when you added it"                                                                                                                                                                        | `ProposalPage`                                           |
| "Clear this to use the record."                                                                                                                          | "Clear this to use the client's saved details."                                                                                                                                                                  | `ProposalPage`                                           |
| "…are on the server and were not touched"                                                                                                                | "…are saved and were not touched"                                                                                                                                                                                | `ErrorBoundary`                                          |
| Tooltip hard-coded "recoverable for 30 days"                                                                                                             | reads `RETENTION_DAYS`                                                                                                                                                                                           | `DashboardPage`                                          |

## Not fixed — needs a decision (in `pricing/morning-questions.md`)

- **"Starter" vs "Example".** Library badges say "Starter"; the tags on
  bids say "Example price/hours/rate"; one labor row can show both. One word.
- **"Quick bid" vs "Count".** The Dashboard card says Quick bid, the bid's
  button says Count, the screen says "Quick bid … counting mode".
- **The demo bid has three names:** "example bid", "sample", "the example
  job".

## Not fixed — a job of its own (listed, not started)

- **~163 raw error toasts.** `onError: e => toast.error(e.message)` shows the
  server's or network's own text ("Failed to fetch", Zod text). Fix with ONE
  helper (friendly sentence on screen, raw text to the console) applied
  everywhere — a mechanical sweep across ~40 files, worth its own commit and
  a look at offline behaviour. Seven places already have a friendly fallback
  that never shows because the raw message wins (`TakeoffPage` plan open
  errors, `BrandingSection` upload, `FixLinePanel`, `CalibrateLayer`).
- "The AI could not be asked: {raw}" and similar on the Plans screen
  (Track B's) — drop the raw part.
- `AccountingExportDialog`, `ScopeNoteFinder` show `{error.message}` inline.
- `LoginPage` "not set up on this server yet" (password reset email off).
- `UnitTemplateActions` "Push to {n}" vs its dialog "Update n copies".
- `SalesTaxSection` "bids pinned to it keep working".
- Toasts without a final period (Materials, Assemblies, Kits, Labor rates,
  Modifiers — ~10).
- `ClientsPage` "Archive {name}?" without quotes; Dashboard tooltip "Total
  due of the Draft bids".
- "takeoff" in "Export takeoff" — kept: electricians know the word, and it
  names the file.
- Admin-only: SearchMisses "its table arrives with a migration",
  BackupHealthBanner "scheduled job".
- Gap: `client/index.html` and `manifest.json` were not searched.
