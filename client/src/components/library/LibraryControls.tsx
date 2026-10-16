/**
 * The two controls every library screen carries: which list, and whose rows.
 *
 * Modifiers had a Working/Archived tab pair already; this is that, lifted out
 * so Materials, Assemblies and Kits get the same thing rather than three
 * lookalikes, with the scope filter added alongside for all five.
 */
import { cn } from "@/lib/utils";
import { Archive, Layers, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { LibraryScope } from "@/lib/libraryScope";

export type LibraryView = "active" | "archived";

/** Working list / Archived. Only shown once there is something archived. */
export function ViewTabs({
  view,
  onChange,
  archivedCount,
}: {
  view: LibraryView;
  onChange: (view: LibraryView) => void;
  archivedCount: number;
}) {
  // Nothing archived means nothing to switch to — an empty Archived tab is a
  // door to a blank room, and it pushes the thing people came for sideways.
  if (archivedCount === 0 && view === "active") return null;

  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {(["active", "archived"] as const).map(value => (
        <button
          key={value}
          onClick={() => onChange(value)}
          className={cn(
            "px-2.5 py-1 rounded-md text-xs transition-colors flex items-center gap-1.5",
            view === value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {value === "active" ? (
            <>
              <Layers className="w-3 h-3" /> Working list
            </>
          ) : (
            <>
              <Archive className="w-3 h-3" /> Archived
            </>
          )}
          {value === "archived" && archivedCount > 0 && (
            <span className="text-muted-foreground">{archivedCount}</span>
          )}
        </button>
      ))}
    </div>
  );
}

/**
 * Everything / just mine.
 *
 * "Mine" covers both a fork of a starter and something built from scratch —
 * see @/lib/libraryScope. The count sits on the control so it is obvious
 * whether switching will show anything at all.
 */
export function ScopeFilter({
  scope,
  onChange,
  counts,
}: {
  scope: LibraryScope;
  onChange: (scope: LibraryScope) => void;
  counts: { all: number; mine: number };
}) {
  /**
   * Nothing of your own means nothing to filter to — the same rule ViewTabs
   * follows above, for the same reason: "Mine 0" is a door to a blank room, and
   * every brand-new account saw one on every library screen before they had
   * created anything.
   *
   * Guarded on the current scope so it cannot vanish out from under someone who
   * is standing in it: if the last item you own is archived while "Mine" is
   * selected, the control stays until you switch back.
   */
  if (counts.mine === 0 && scope === "all") return null;

  return (
    <div className="inline-flex rounded-lg border border-border p-0.5">
      {(["all", "mine"] as const).map(value => (
        <button
          key={value}
          onClick={() => onChange(value)}
          title={
            value === "all"
              ? "Everything — the starter library and your own"
              : "Only what you have created or customized"
          }
          className={cn(
            "px-2.5 py-1 rounded-md text-xs transition-colors flex items-center gap-1.5",
            scope === value
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {value === "all" ? (
            <>All</>
          ) : (
            <>
              <User className="w-3 h-3" /> Mine
            </>
          )}
          <span className="text-muted-foreground">
            {value === "all" ? counts.all : counts.mine}
          </span>
        </button>
      ))}
    </div>
  );
}

/** "Starter" / "Your copy" / "Yours", styled consistently across all screens. */
export function OriginBadge({
  row,
}: {
  row: { userId: number | null; baselineId: number | null };
}) {
  if (row.userId === null) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        Starter
      </Badge>
    );
  }
  if (row.baselineId != null) {
    // "Your copy" rather than "Edited": after a revert the row is still the
    // user's own fork, just holding starter content again. Labelling by
    // ownership stays true; labelling by edited-ness would go stale.
    return (
      <Badge
        variant="outline"
        className="text-xs bg-[#F5C518]/15 text-[#F5C518] border-[#F5C518]/30"
      >
        Your copy
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs">
      Yours
    </Badge>
  );
}
