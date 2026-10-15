# Track B — stress results (overnight 2026-10-14 → 15)

Screens B owns: Plans / takeoff, plan-reading help, starter offers. Every
number here was measured on this laptop (local MySQL 3307, dev server on
3002 unless it says "build"); the method is next to it. **Expected, not
bugs:** missing prices, missing hours, "Not priced" and "Example" labels.

## Round 1 — starter offers at scale

Method: `scripts/_stressOffers.mts` (throwaway, deleted) against
`bidrender_test_b`: N throwaway shops (users 7,000,000+), one probe
material, then K more changes; times read off `Date.now()` around each call.

| What                                   | 306 shops          | 2,006 shops          |
| -------------------------------------- | ------------------ | -------------------- |
| Preview, first edit of a row           | 928 ms → **27 ms** | 7,321 ms → **27 ms** |
| Confirm, first edit (forks every shop) | 932 ms             | **6,693 ms**         |
| Each later change to that row          | **414 ms → 10 ms** | 15–18 ms             |
| One shop's offer read                  | 9 ms               | 5 ms                 |
| Accept all (2 offers)                  | 20 ms              | 13 ms                |

- **Fixed — a change pinned nobody but still visited every shop.**
  `pinCompanies` asked the fork function about each of N shops (two queries
  each) to learn they already had a copy: 414 ms per change at 306 shops,
  about 4 s at 3,000, an hour for a 1,000-row sheet in ONE transaction.
  Now one query lists the shops with no copy the fork would reuse
  (`unpinnedOwners`); the fork stays the authority for every shop listed.
- **Fixed — the preview forked every shop to count them.** It is a
  rolled-back dry run; it now counts the same list (`countPins`) and forks
  nobody: 7.3 s → 27 ms at 2,006 shops. Plan test 14 (preview pins =
  Confirm pins) still holds, and now covers a shop with its own copy (not
  pinned, but offered).
- **Left, written up:** Confirm on a row's FIRST edit forks a copy for every
  shop without one — about 3.3 ms per shop (6.7 s at 2,006). It is one
  admin action per row, and live has a handful of shops today. The Confirm
  button now says "Saving…". A set-based fork would restate each table's
  fork rules, which is the risk `forkedRows.ts` exists to avoid; not worth
  it until there are thousands of shops. `morning-questions-b.md` Q2.
