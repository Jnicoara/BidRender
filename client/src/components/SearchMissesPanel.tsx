/**
 * "Searches that found nothing" — the admin view of the no-match log
 * (shared/searchMiss.ts, server/searchMissLog.ts).
 *
 * What people typed into an assembly or material picker and got nothing
 * back, newest first, repeats counted. Words only: no prices, no bids, no
 * names of who typed them, and no AI reading it. It is here so the next
 * catalog and starter work follows real searches rather than guesses.
 *
 * Shows the newest few with the rest behind ONE "Show all" (CLAUDE.md §
 * "Customization available, but never in the way"), so the panel is the
 * same shape at 5 lines as at 300.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";

/** Lines shown before "Show all". */
const FIRST_LINES = 12;

export function SearchMissesPanel() {
  const misses = trpc.searchMisses.list.useQuery(undefined, {
    staleTime: 60 * 1000,
    retry: false,
  });
  const [showAll, setShowAll] = useState(false);

  const data = misses.data;
  const rows = data?.rows ?? [];
  const shown = showAll ? rows : rows.slice(0, FIRST_LINES);

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold">
        Searches that found nothing
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        Words typed into an assembly or material search that matched nothing,
        newest first. Only the words are kept — no prices, no bids, no names.
      </p>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {misses.isError ? (
          <p className="px-5 py-3 text-xs text-muted-foreground">
            Could not read the search log. Searching itself is unaffected.
          </p>
        ) : !data ? (
          <p className="px-5 py-3 text-xs text-muted-foreground">Loading…</p>
        ) : !data.ready ? (
          <p className="px-5 py-3 text-xs text-muted-foreground">
            The search log is not set up on this database yet (its table arrives
            with a migration). Nothing is being recorded until then.
          </p>
        ) : rows.length === 0 ? (
          <p className="px-5 py-3 text-xs text-muted-foreground">
            No empty searches yet.
          </p>
        ) : (
          <>
            <div className="divide-y divide-border">
              {shown.map(row => (
                <div
                  key={`${row.picker}:${row.words}`}
                  className="flex items-baseline justify-between gap-3 px-5 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium">
                      “{row.words}”
                    </p>
                    <p className="text-[0.65rem] text-muted-foreground">
                      {row.picker === "material" ? "Material" : "Assembly"}{" "}
                      search
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs tabular-nums">
                      {row.times === 1 ? "once" : `${row.times} times`}
                      {row.companies > 1 ? ` · ${row.companies} companies` : ""}
                    </p>
                    <p className="text-[0.65rem] tabular-nums text-muted-foreground">
                      last{" "}
                      {new Date(row.lastAt).toLocaleDateString(undefined, {
                        dateStyle: "medium",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            {rows.length > FIRST_LINES ? (
              <button
                type="button"
                onClick={() => setShowAll(v => !v)}
                className="w-full border-t border-border px-5 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
              >
                {showAll ? "Show fewer" : `Show all ${rows.length}`}
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
