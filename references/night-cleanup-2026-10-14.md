# Cleanup, measured — Track A night run 2026-10-14

Light, safe items from the roadmap. **Nothing here changed `drizzle/`, a
database, or the gate's behaviour.** Everything is a measurement plus a draft
someone can apply on purpose.

## 1. The drizzle snapshot hole — DRAFT `references/drafts/drizzle-snapshot/0163_snapshot.json`

**The roadmap said "0059–0064". The hole is 0059–0163.** `drizzle/meta/` has
snapshots for 0000–0053 (except 0032 and 0035), 0057 and 0058, and none since, because every
migration after 0058 was hand-written (`deploying.md` § 5, "NEVER RUN
GENERATED MIGRATION OUTPUT"). Snapshots for 0059–0064 alone would not help:
`drizzle-kit generate` diffs the schema against the LATEST snapshot, so it
would still re-emit 0065–0163. What closes the hole is one snapshot of the
schema as it stands now, chained after 0058.

**Measured, all in a scratch directory (`drizzle/` untouched):**

| Check                                                                                                          | Result                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `generate` today (latest snapshot 0058)                                                                        | **338 statements**: 32 `CREATE TABLE`, ~190 `ADD` column, 38 `CREATE INDEX` — all already live. Run, it dies on the first duplicate.                                                                           |
| `generate` with the draft installed as `0163_snapshot.json` (`prevId` = 0058's id)                             | **"No schema changes, nothing to migrate"**                                                                                                                                                                    |
| Draft vs a database built by all 164 migrations (`drizzle-kit pull` from `bidrender_test_localdev`, read-only) | 86 = 86 tables, 1,105 columns: **0 real differences** in type, NOT NULL, default, index, unique or foreign key. 131 raw differences, all spelling: `boolean` = `tinyint(1)`, `'0'` = `'0.0000'`, `true` = `1`. |

**To install (A, on purpose, in its own commit — it IS a `drizzle/` change,
so on a track branch the drizzle guard refuses it):**

1. Check `drizzle/schema.ts` has not changed since `656b0fb8` (0163). If it
   has, regenerate the draft rather than installing a stale one: run
   `drizzle-kit generate` with a config whose `out` is a scratch folder
   holding NO journal (it then writes a full `0000_snapshot.json`), and set
   its `prevId` to `drizzle/meta/0058_snapshot.json`'s `id`. Use a RELATIVE
   `out` — an absolute Windows path is joined onto the working directory.
2. Copy it to `drizzle/meta/0163_snapshot.json`. The journal already lists
   0163; it needs no edit.
3. Prove it: `npx drizzle-kit generate` must print "No schema changes". If it
   prints statements, delete them and the new snapshot and stop.
4. From then on, a hand-written migration should be followed by a fresh
   snapshot the same way, or the hole reopens at the next one.

## 2. Dead tables — the list, measured

"Reached" = a non-test file outside `schema.ts` names the table, or names a
`db.ts` function that does (one hop), AND the client calls the router that
gets there. The routers the client never calls (searched `client/src` and
`e2e/` for `trpc.<key>.`, `utils.<key>.`, `.<key>.use…`): `projects`,
`masterItems`, `masterAssemblies`, `masterLaborRates`, `projectAssemblies`,
`projectItems`, `bidSummary` — plus `system` (platform plumbing) and
`signupInvites` (new tonight, UI not built). That matches CLAUDE.md's
"legacy model" list, plus `projects` and `user_materials_db`.

| Table                    | Reached only by                                                                                  | Rows: local real-data copy | Inbound FKs                 |
| ------------------------ | ------------------------------------------------------------------------------------------------ | -------------------------: | --------------------------- |
| `master_items`           | masterItems / masterAssemblies / projectAssemblies routers                                       |                        127 | from other dead tables only |
| `master_assemblies`      | same                                                                                             |                        122 | dead only                   |
| `master_assembly_items`  | same                                                                                             |                          4 | —                           |
| `master_labor_rates`     | masterLaborRates router                                                                          |                          0 | dead only (`bid_summary`)   |
| `project_assemblies`     | projectAssemblies router                                                                         |                          0 | dead only                   |
| `project_assembly_items` | same                                                                                             |                          0 | —                           |
| `project_items`          | projectItems router                                                                              |                          0 | —                           |
| `projects`               | projects router; **the backup's file list** (`projects.pdfKey`, `server/backup/collectFiles.ts`) |                          0 | dead only                   |
| `bid_summary`            | bidSummary router                                                                                |                          0 | —                           |
| `user_materials_db`      | bidSummary router                                                                                |                      1,056 | —                           |
| `feature_flags`          | nothing (CLAUDE.md: kept only so drizzle-kit does not queue a DROP)                              |                          1 | —                           |

No live table has a foreign key into any of them; they only point at each
other. **Not dropped, and not proposed for this release.** A drop is a
meaning change with no undo, so it wants: live row counts read on the day
(local is a restored copy, not live); the legacy routers and their `db.ts`
functions removed first (a release earlier); `projects.pdfKey` taken out of
the backup's `FILE_SOURCES` only after checking live holds no file under it
(a stored plan reachable only through it would leave the backup); a backup;
the drops in FK order (children first). Also recorded and **not** dead: four
tables added 2026-10-13/14 that nothing reads YET — `starter_offer_answers`,
`price_imports`, `price_import_rows`, `material_price_history`, plus
`bid_pdf_legend_entries` — their code is coming (step 1 first).

## 3. Type-checking `scripts/` — measured, not changed

`pnpm check` covers app and test files (since 2026-09-26) but not the
`scripts/*.mts` tools, including `migrate.mts` and `schemaDrift.mts` that run
against production. Measured tonight with `--incremental false` (the shared
`tsBuildInfoFile` otherwise reuses one config's answer for another — the first
attempt here did exactly that and reported the same 589 twice):

| Config                              | Errors                                                                                                                                                                                                                   |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| today + `scripts/**/*.mts`          | **589 in 56 files** (564 top-level `await`, 11 iterations, 8 implicit any, 6 real)                                                                                                                                       |
| + `target: ES2022`                  | **5 in 2 files**: `rehearseBackfill.mts` (reads `conduitFeet` / `cableFeet` / `wireFeet` off totals that no longer have them — a 2026-09-20 rehearsal) and `groundShareImpact.mts` (`TracedRun` gained a required field) |
| the app alone with `target: ES2022` | **0**                                                                                                                                                                                                                    |

**Not applied**, because `todo.md` records why `target` is a decision:
Vite / esbuild read it for `useDefineForClassFields`, so it can change how
shipped classes compile. The proposal, ready when that is decided: set
`target: ES2022`; fix or retire the two stale scripts (they cannot run as
written today either, so a red there is true); add `scripts/**/*.mts` to
`include`. `todo.md` § type-check now carries these numbers.
