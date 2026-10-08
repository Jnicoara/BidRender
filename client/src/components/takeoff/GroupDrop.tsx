/**
 * THE DROP ON A COUNTED ITEM — verticals on marks
 * (references/track-b-held-migrations-plan.md § 3).
 *
 * Set once on the GROUP (§ 7: "a vertical belongs to the group, not each
 * stamp"), so it lives on the counted-item row: what each mark drops TO, what
 * the drop is MADE of, and optionally this group's own height. The numbers it
 * shows come from shared/groupDrops.ts through `takeoffGroups.list` — the same
 * function the bid line and the totals read — so the row cannot disagree
 * with them.
 *
 * ── Quiet until asked ────────────────────────────────────────────────────────
 * Most counted things are fed some other way, so a group with no drop shows
 * one small link and nothing else (CLAUDE.md § Customization — behind ONE
 * control). Once a drop is set it is always shown.
 *
 * ── Said in words, every time a drop counts ──────────────────────────────────
 *   - the full arithmetic: "Receptacle 1'-6" from run height 10'-0" · 8.50 ft
 *     each × 12 = 102.00 ft";
 *   - fittings for these drops are NOT counted (owner, 2026-09-28, Q8);
 *   - a whip on the assembly beside the drop, with the caution that it may
 *     already include it (Q7) — shown, never blocked;
 *   - marks a run end claims (their drop is the run's), and marks sitting near
 *     an unlinked run end, which MAY be counted twice (flagged, not guessed).
 */
import { useState } from "react";
import { TriangleAlert, Undo2 } from "lucide-react";
import { HeightFields } from "@/components/HeightFields";
import {
  applyDropPatch,
  dropFieldsDiffer,
  dropFieldsOf,
  restoreDropPatch,
  type DropFields,
} from "@/lib/dropUndo";
import { formatElevation } from "@shared/takeoffHeights";
import type { GroupDrop as GroupDropResult } from "@shared/groupDrops";

export type GroupDropInfo = {
  dropKind: string | null;
  dropHeightInches: number | null;
  dropRunTypeId: number | null;
  result: GroupDropResult | null;
  whipFeet: number | null;
};

export type GroupDropPatch = {
  dropKind?: string | null;
  dropHeightInches?: number | null;
  dropRunTypeId?: number | null;
};

const DISTRIBUTION = "distribution";

export function GroupDrop({
  info,
  heightTypes,
  runTypes,
  onSet,
  locked,
}: {
  info: GroupDropInfo;
  /** Active height types, as the heights screen names them. */
  heightTypes: readonly {
    typeKey: string;
    label: string;
    heightInches: number | null;
  }[];
  /** The run-type palette, conduit and cable. */
  runTypes: readonly { id: number; label: string; pathType: string }[];
  onSet: (patch: GroupDropPatch) => void;
  /** A locked bid refuses drop changes; the controls say so rather than fail. */
  locked: boolean;
}) {
  const [open, setOpen] = useState(false);
  /**
   * The drop as it was before the last change, for "Undo drops" (owner,
   * 2026-09-29). The drops a click adds are exactly the difference between
   * the group's three fields before and after it, so undoing the click is
   * writing those three back — nothing else moves. See @/lib/dropUndo.
   */
  const [undo, setUndo] = useState<DropFields | null>(null);
  const set = (patch: GroupDropPatch) => {
    const before = dropFieldsOf(info);
    if (dropFieldsDiffer(before, applyDropPatch(before, patch)))
      setUndo(before);
    onSet(patch);
  };
  const undoDrops = () => {
    if (!undo) return;
    onSet(restoreDropPatch(undo));
    setUndo(null);
  };
  const r = info.result;
  /*
    What the drops go to: the count's own answer, else its ITEM's "Mounts
    at" (owner, 2026-10-07) — resolved on the server, said here as "from
    the item" so nobody reads it as an answer given on this job.
  */
  const fromItem = info.dropKind === null && r?.dropKindFromItem === true;
  const kind = info.dropKind ?? (fromItem ? (r?.dropKind ?? null) : null);

  if (kind === null && !open) {
    if (locked) return null;
    return (
      <button
        type="button"
        className="mt-1 block text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        Add a drop to each one
      </button>
    );
  }

  const typeLabel =
    heightTypes.find(t => t.typeKey === kind)?.label ?? kind ?? "";
  const runType = runTypes.find(t => t.id === info.dropRunTypeId);
  // From the buckets, never "one drop × marks": a mark at its own height
  // drops a different length (vertical-drops-plan § 2).
  const total = r ? r.totalDropFeet : null;
  const atCountHeight =
    r && r.perDropFeet !== null
      ? r.countedMarks.length - (r.ownHeightCount ?? 0)
      : 0;

  return (
    <div className="mt-1.5 space-y-1 rounded border border-border/60 bg-muted/20 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Each drops to</span>
        <select
          className="h-6 rounded-md border border-input bg-transparent px-1.5 text-xs text-foreground"
          value={info.dropKind ?? ""}
          disabled={locked}
          aria-label="What each mark drops to"
          onChange={e =>
            set({ dropKind: e.target.value === "" ? null : e.target.value })
          }
        >
          <option value="">
            {fromItem ? `${typeLabel} — from the item` : "no drop"}
          </option>
          <option value={DISTRIBUTION}>nothing — at run height</option>
          {heightTypes
            .filter(t => t.typeKey !== DISTRIBUTION)
            .map(t => (
              <option key={t.typeKey} value={t.typeKey}>
                {t.label}
                {t.heightInches !== null
                  ? ` (${formatElevation(t.heightInches)})`
                  : ""}
              </option>
            ))}
        </select>
        <span className="text-muted-foreground">in</span>
        <select
          className="h-6 max-w-[12rem] rounded-md border border-input bg-transparent px-1.5 text-xs text-foreground"
          value={info.dropRunTypeId ?? ""}
          disabled={locked}
          aria-label="What each drop is made of"
          onChange={e =>
            set({
              dropRunTypeId:
                e.target.value === "" ? null : Number(e.target.value),
            })
          }
        >
          <option value="">choose a run type</option>
          {runTypes.map(t => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      {undo && !locked && (
        <button
          type="button"
          className="flex items-center gap-1 text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
          onClick={undoDrops}
          title="Put this count's drop back the way it was before your last change. Its marks and every other count stay as they are."
        >
          <Undo2 className="w-3 h-3" />
          Undo drops
        </button>
      )}

      {kind !== null && kind !== DISTRIBUTION && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground shrink-0">
            Height for this count
          </span>
          <HeightFields
            value={info.dropHeightInches}
            belowFloor={false}
            ariaPrefix="Device height for this count"
            onSave={inches => set({ dropHeightInches: inches })}
            onClear={
              info.dropHeightInches !== null
                ? () => set({ dropHeightInches: null })
                : undefined
            }
            clearLabel="Use the type's"
            unsetLabel={`the ${typeLabel || "type"}'s height`}
            compact
          />
        </div>
      )}

      {r?.status === "counted" && total !== null && (
        <>
          <p className="text-xs font-mono text-right">
            <span className="text-muted-foreground/70">
              {r.perDropFeet !== null && atCountHeight > 0 && (
                <>
                  {typeLabel}{" "}
                  {r.deviceInches !== null
                    ? formatElevation(r.deviceInches)
                    : ""}
                  {r.distributionInches !== null
                    ? ` from run height ${formatElevation(r.distributionInches)}`
                    : ""}{" "}
                  {info.dropHeightInches === null ? " (default height)" : ""} ·{" "}
                  {r.perDropFeet.toFixed(2)} ft × {atCountHeight}
                </>
              )}
              {r.ownHeightCount > 0 &&
                `${r.perDropFeet !== null && atCountHeight > 0 ? " + " : ""}${r.ownHeightCount} at ${r.ownHeightCount === 1 ? "its own height" : "their own heights"}`}{" "}
              ={" "}
            </span>
            {total.toFixed(2)} ft
          </p>
          {r.excludedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {r.excludedCount}{" "}
              {r.excludedCount === 1 ? "mark has" : "marks have"} no drop — left
              off by hand.
            </p>
          )}
          {r.uncounted && (
            <p className="text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1">
              <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
              {r.uncounted.count}{" "}
              {r.uncounted.count === 1 ? "mark has" : "marks have"} no drop
              counted — {r.uncounted.reason}.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            In {runType?.label ?? "the chosen run type"} — on that type's bid
            lines, with wire extra and makeup. Connectors and elbows for these{" "}
            {r.countedMarks.length} drops are NOT counted — add them by hand.
          </p>
          {info.whipFeet !== null && info.whipFeet > 0 && (
            <p className="text-xs text-muted-foreground">
              Whip {info.whipFeet} ft + drop{" "}
              {r.perDropFeet !== null
                ? `${r.perDropFeet.toFixed(2)} ft each`
                : "at each mark's height"}
              — this assembly's whip may already include the drop.
            </p>
          )}
          {r.claimedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {r.claimedCount} {r.claimedCount === 1 ? "mark is" : "marks are"}{" "}
              at a run's end, and the run counts{" "}
              {r.claimedCount === 1 ? "its" : "their"} drop.
            </p>
          )}
          {r.homerunClaimedCount > 0 && (
            <p className="text-xs text-muted-foreground">
              {r.homerunClaimedCount}{" "}
              {r.homerunClaimedCount === 1 ? "mark is" : "marks are"} where a
              homerun rises, and the homerun counts{" "}
              {r.homerunClaimedCount === 1 ? "its" : "their"} drop.
            </p>
          )}
          {r.mayDoubleCount > 0 && (
            <p className="text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1">
              <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
              {r.mayDoubleCount} {r.mayDoubleCount === 1 ? "sits" : "sit"} near
              a run's end without being linked — the drop may be counted twice.
              Link {r.mayDoubleCount === 1 ? "it" : "them"} to the run.
            </p>
          )}
        </>
      )}
      {r?.status === "no-height" && (
        <p className="text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1">
          <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
          No drop counted — {r.reason}.
        </p>
      )}
      {/*
        NO DROP MATERIAL (owner, 2026-10-07): said with HOW MANY drops it
        leaves unpriced, never a quiet 0 ft. The fix is the picker above.
      */}
      {r?.status === "no-type" && (
        <p className="text-xs text-warning bg-warning/10 rounded px-2 py-1 flex items-start gap-1">
          <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
          Drop material not set — {r.notPricedDrops}{" "}
          {r.notPricedDrops === 1 ? "drop" : "drops"} not priced. Pick what each
          drop is made of.
        </p>
      )}
      {locked && (
        <p className="text-xs text-muted-foreground">
          This bid's quantities are locked, so its drops cannot change.
        </p>
      )}
    </div>
  );
}
