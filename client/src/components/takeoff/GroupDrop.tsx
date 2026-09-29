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
import { TriangleAlert } from "lucide-react";
import { HeightFields } from "@/components/HeightFields";
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
  const r = info.result;

  if (info.dropKind === null && !open) {
    if (locked) return null;
    return (
      <button
        type="button"
        className="mt-1 block text-[0.7rem] underline underline-offset-2 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
      >
        Add a drop to each one
      </button>
    );
  }

  const typeLabel =
    heightTypes.find(t => t.typeKey === info.dropKind)?.label ??
    info.dropKind ??
    "";
  const runType = runTypes.find(t => t.id === info.dropRunTypeId);
  const total =
    r && r.perDropFeet !== null
      ? Math.round(r.perDropFeet * r.countedMarks.length * 100) / 100
      : null;

  return (
    <div className="mt-1.5 space-y-1 rounded border border-border/60 bg-muted/20 px-2 py-1.5">
      <div className="flex flex-wrap items-center gap-1.5 text-[0.7rem]">
        <span className="text-muted-foreground">Each drops to</span>
        <select
          className="h-6 rounded-md border border-input bg-transparent px-1.5 text-[0.7rem] text-foreground"
          value={info.dropKind ?? ""}
          disabled={locked}
          aria-label="What each mark drops to"
          onChange={e =>
            onSet({ dropKind: e.target.value === "" ? null : e.target.value })
          }
        >
          <option value="">no drop</option>
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
          className="h-6 max-w-[12rem] rounded-md border border-input bg-transparent px-1.5 text-[0.7rem] text-foreground"
          value={info.dropRunTypeId ?? ""}
          disabled={locked}
          aria-label="What each drop is made of"
          onChange={e =>
            onSet({
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

      {info.dropKind !== null && info.dropKind !== DISTRIBUTION && (
        <div className="flex items-center gap-2 text-[0.7rem]">
          <span className="text-muted-foreground shrink-0">
            Height for this count
          </span>
          <HeightFields
            value={info.dropHeightInches}
            belowFloor={false}
            ariaPrefix="Device height for this count"
            onSave={inches => onSet({ dropHeightInches: inches })}
            onClear={
              info.dropHeightInches !== null
                ? () => onSet({ dropHeightInches: null })
                : undefined
            }
            clearLabel="Use the type's"
            unsetLabel={`the ${typeLabel || "type"}'s height`}
            compact
          />
        </div>
      )}

      {r?.status === "counted" && r.perDropFeet !== null && total !== null && (
        <>
          <p className="text-xs font-mono text-right">
            <span className="text-muted-foreground/70">
              {typeLabel}{" "}
              {r.deviceInches !== null ? formatElevation(r.deviceInches) : ""}
              {r.distributionInches !== null
                ? ` from run height ${formatElevation(r.distributionInches)}`
                : ""}{" "}
              · {r.perDropFeet.toFixed(2)} ft × {r.countedMarks.length} ={" "}
            </span>
            {total.toFixed(2)} ft
          </p>
          <p className="text-[0.7rem] text-muted-foreground">
            In {runType?.label ?? "the chosen run type"} — on that type's bid
            lines, with wire extra and makeup. Connectors and elbows for these{" "}
            {r.countedMarks.length} drops are NOT counted — add them by hand.
          </p>
          {info.whipFeet !== null && info.whipFeet > 0 && (
            <p className="text-[0.7rem] text-muted-foreground">
              Whip {info.whipFeet} ft + drop {r.perDropFeet.toFixed(2)} ft each
              — this assembly's whip may already include the drop.
            </p>
          )}
          {r.claimedCount > 0 && (
            <p className="text-[0.7rem] text-muted-foreground">
              {r.claimedCount} {r.claimedCount === 1 ? "mark is" : "marks are"}{" "}
              at a run's end, and the run counts{" "}
              {r.claimedCount === 1 ? "its" : "their"} drop.
            </p>
          )}
          {r.mayDoubleCount > 0 && (
            <p className="text-[0.7rem] text-[#F5C518] flex items-start gap-1">
              <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
              {r.mayDoubleCount} {r.mayDoubleCount === 1 ? "sits" : "sit"} near
              a run's end without being linked — the drop may be counted twice.
              Link {r.mayDoubleCount === 1 ? "it" : "them"} to the run.
            </p>
          )}
        </>
      )}
      {(r?.status === "no-height" || r?.status === "no-type") && (
        <p className="text-[0.7rem] text-[#F5C518] flex items-start gap-1">
          <TriangleAlert className="w-3 h-3 mt-0.5 shrink-0" />
          No drop counted — {r.reason}.
        </p>
      )}
      {locked && (
        <p className="text-[0.7rem] text-muted-foreground">
          This bid's quantities are locked, so its drops cannot change.
        </p>
      )}
    </div>
  );
}
