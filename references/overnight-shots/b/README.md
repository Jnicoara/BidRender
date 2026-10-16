# Track B overnight screens — screenshots, 2026-10-15

Taken headless (Playwright, real viewport sizes, as `pnpm device:audit` does)
against the local dev server, by a throwaway script that was deleted after use.

Sizes: `laptop` 1536x864, `tablet-portrait` 820x1180, `tablet-landscape`
1180x820, `phone` 390x844.

| File (per size)                   | What it shows                                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| `shop-1-dashboard-card`           | Dashboard: "N starter updates available" card                                                |
| `shop-2-updates-tab`              | Materials → Updates tab: each offer with Ignore / Accept, and Accept all                     |
| `shop-3-accept-all-warning`       | The Accept all warning (says whether draft bids re-count; sent bids never change)            |
| `admin-1-preview`                 | Starter editor: change dialog after Preview — old → new, how many shops are pinned / offered |
| `admin-2-confirmed` (laptop only) | After Confirm: "Saved. 71 shops pinned to the old value."                                    |
| `admin-3-change-log`              | Starter editor: Change log tab, newest first, with Undo                                      |
| `admin-4-undo`                    | The Undo dialog                                                                              |
| `plans-1-offline-retrying`        | Plans: a mark placed while the server is unreachable — "1 mark is not saved yet …"           |
| `plans-2-sheet-try-again`         | Plans: the plan file can't be reached — message and Try again                                |

The change used for the admin and shop shots (one starter price set to $1.23)
was undone through the app's own Undo afterwards. The offline shot blocked only
the mark-saving requests; the mark saved by itself once they were let through.
The sheet shot blocked the plan file.

The dates in the Updates tab can read a day early (Oct 14 for a change made at 6 AM on Oct 15). That is THIS
MACHINE only: the local MySQL runs on Pacific time while the app reads
timestamps as UTC. Production MySQL is UTC.
