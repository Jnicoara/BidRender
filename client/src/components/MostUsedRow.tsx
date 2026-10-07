/**
 * The "Most used" row at the top of an assembly picker — this company's top
 * assemblies by number of bids (`assemblies.mostUsed`, shared/mostUsed.ts),
 * one click to add.
 *
 * ONE component for both pickers (the bid screen and Quick bid), so the two
 * cannot drift (CLAUDE.md § "Copying a layout does not copy the behaviour").
 * When it shows is `showMostUsed` (@/lib/mostUsedRow), where it is tested.
 *
 * Chips are 32 px with a mouse and 44 px on a touch screen, the tap-target
 * rule (device audit).
 */
import { Plus } from "lucide-react";
import { showMostUsed } from "@/lib/mostUsedRow";

export type MostUsedItem = { id: number; name: string; bids: number };

export function MostUsedRow({
  items,
  query,
  onAdd,
}: {
  items: readonly MostUsedItem[];
  /** The picker's search text — the row hides while it is not empty. */
  query: string;
  onAdd: (assemblyId: number) => void;
}) {
  if (!showMostUsed(query, items)) return null;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] text-muted-foreground">Most used</div>
      <div className="flex flex-wrap gap-1.5">
        {items.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onAdd(item.id)}
            title={`Used on ${item.bids} bid${item.bids === 1 ? "" : "s"} in the last 12 months — click to add`}
            className="inline-flex items-center gap-1 max-w-full rounded-full border border-border bg-muted/30 px-2.5 h-8 [@media(pointer:coarse)]:h-11 text-xs hover:bg-[#F5C518]/10 hover:border-[#F5C518]/40 transition-colors"
          >
            <Plus className="w-3 h-3 text-muted-foreground shrink-0" />
            <span className="truncate">{item.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
