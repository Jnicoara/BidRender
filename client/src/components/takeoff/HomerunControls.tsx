/**
 * HOMERUNS on the Circuits panel (references/homerun-footage-plan.md § 6–7,
 * § 10 step 3): the bid's settings at the top, and under each circuit its
 * homerun — what it comes to, each piece, Confirm, a typed length and its
 * own ceiling.
 *
 * Everything shown is the SERVER's answer (`homeruns.forBid`), the same one
 * the bid line reads, so the panel and the bid cannot disagree. Simple by
 * default: a row shows its number and status; picking it shows the
 * overrides (CLAUDE.md § "Customization available, but never in the way").
 */
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { useState } from "react";
import { Check, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InlineNumberField } from "@/components/InlineNumberField";
import { HeightFields } from "@/components/HeightFields";
import {
  HOMERUN_METHOD_LABELS,
  HOMERUN_METHODS,
  parseHomerunMethod,
  type HomerunMethod,
} from "@shared/homerunFootage";
import { formatElevation } from "@shared/takeoffHeights";
import {
  ft,
  homerunBreakdown,
  methodText,
  refusalText,
} from "@/lib/homerunText";

export type HomerunsData = inferRouterOutputs<AppRouter>["homeruns"]["forBid"];
export type HomerunRowData = HomerunsData["rows"][number];

export type BidHomerunPatch = {
  method?: HomerunMethod | null;
  averageFt?: number | null;
  minimumFt?: number | null;
  routingPct?: number | null;
  runTypeId?: number | null;
};

const CEILING_FROM: Record<string, string> = {
  homerun: "this homerun",
  area: "the height area",
  sheet: "the sheet",
  job: "the job",
  company: "the company",
};

const selectClass =
  "min-h-11 rounded-md border border-border bg-background px-2 text-xs";

/** The bid's homerun settings, and the bid-wide total. */
export function HomerunSettings({
  data,
  sheetMethod,
  runTypes,
  onBid,
  onSheet,
  confirmable,
  onConfirmAll,
}: {
  data: HomerunsData;
  /** This sheet's own method override; NULL follows the bid. */
  sheetMethod: string | null;
  runTypes: readonly { id: number; label: string }[];
  onBid: (patch: BidHomerunPatch) => void;
  onSheet: (method: HomerunMethod | null) => void;
  /** Unconfirmed homeruns on this sheet whose method guessed nothing. */
  confirmable: number[];
  onConfirmAll: (ids: number[]) => void;
}) {
  const s = data.settings;
  const method = parseHomerunMethod(s.method) ?? "measured";
  const locked = data.locked;
  const t = data.totals;
  const counted = data.rows.filter(r => r.footage.state === "computed").length;
  const [open, setOpen] = useState(s.runTypeId === null);
  return (
    <div className="rounded-md border border-border p-2 space-y-2 text-xs">
      <div className="font-medium text-sm">Homeruns on this bid</div>
      <div>
        {counted} homerun{counted === 1 ? "" : "s"} · {ft(t.wireFt)} of wire
        {t.unconfirmed > 0 && (
          <span className="text-[#B45309] dark:text-[#F59E0B]">
            {" "}
            + {t.unconfirmed} unconfirmed
          </span>
        )}
        {t.notCounted > 0 && (
          <span className="text-muted-foreground">
            {" "}
            · {t.notCounted} with no number yet
          </span>
        )}
      </div>

      {/*
        FOLDED once set up (seen on screen 2026-10-07: open, the card pushed
        the circuits below a tablet's fold). One line says what is in
        effect; the controls are one tap away. Open by itself while no run
        type is picked, because that is the one thing keeping every homerun
        off the bid.
      */}
      <button
        type="button"
        className="w-full min-h-11 flex items-center gap-1 text-left text-muted-foreground hover:text-foreground"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 shrink-0" />
        )}
        <span className="min-w-0 truncate">
          {HOMERUN_METHOD_LABELS[method]} ·{" "}
          {s.routingPct === null
            ? "no routing"
            : `+${Math.round(s.routingPct * 1000) / 10}% routing`}{" "}
          · {runTypes.find(r => r.id === s.runTypeId)?.label ?? "no run type"}
        </span>
      </button>

      {open && (
        <>
          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">Method</span>
            <select
              className={selectClass + " flex-1"}
              value={method}
              disabled={locked}
              onChange={e =>
                onBid({ method: parseHomerunMethod(e.target.value) ?? null })
              }
            >
              {HOMERUN_METHODS.map(m => (
                <option key={m} value={m}>
                  {HOMERUN_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>
          {method === "average" && (
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">
                Average
              </span>
              <InlineNumberField
                value={s.averageFt}
                whenUnset={{ placeholder: "length per homerun" }}
                ariaLabel="Average homerun length"
                suffix="ft"
                rules={{ min: 0, max: 10000 }}
                disabled={locked}
                onSave={v => onBid({ averageFt: v })}
                onClear={() => onBid({ averageFt: null })}
              />
            </div>
          )}
          {method === "measuredMin" && (
            <div className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-muted-foreground">
                Minimum
              </span>
              <InlineNumberField
                value={s.minimumFt}
                whenUnset={{ placeholder: "shortest homerun" }}
                ariaLabel="Minimum homerun length"
                suffix="ft"
                rules={{ min: 0, max: 10000 }}
                disabled={locked}
                onSave={v => onBid({ minimumFt: v })}
                onClear={() => onBid({ minimumFt: null })}
              />
            </div>
          )}

          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">
              This sheet
            </span>
            <select
              className={selectClass + " flex-1"}
              value={sheetMethod ?? ""}
              disabled={locked}
              onChange={e => onSheet(parseHomerunMethod(e.target.value))}
            >
              <option value="">Follows the bid</option>
              {HOMERUN_METHODS.map(m => (
                <option key={m} value={m}>
                  {HOMERUN_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">Routing</span>
            {s.routingPct === null ? (
              <>
                <span className="text-muted-foreground">None added</span>
                {/* Shown, never applied by itself (CLAUDE.md § Starter content). */}
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11 text-xs"
                  disabled={locked}
                  onClick={() => onBid({ routingPct: data.routingStarterPct })}
                  title="Starter, 2026-10-06 — verify against your own work"
                >
                  Use +{Math.round(data.routingStarterPct * 100)}%
                </Button>
              </>
            ) : (
              <InlineNumberField
                value={Math.round(s.routingPct * 10000) / 100}
                ariaLabel="Routing factor"
                suffix="%"
                rules={{ min: 0, max: 500 }}
                disabled={locked}
                onSave={v => onBid({ routingPct: v / 100 })}
              />
            )}
          </div>

          <label className="flex items-center gap-2">
            <span className="w-24 shrink-0 text-muted-foreground">Made of</span>
            <select
              className={selectClass + " flex-1 min-w-0"}
              value={s.runTypeId ?? ""}
              disabled={locked}
              onChange={e =>
                onBid({
                  runTypeId:
                    e.target.value === "" ? null : Number(e.target.value),
                })
              }
            >
              <option value="">Pick a run type…</option>
              {runTypes.map(r => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          {s.runTypeId === null ? (
            <div className="text-[#B45309] dark:text-[#F59E0B]">
              Pick what a homerun is made of — until then no homerun reaches the
              bid.
            </div>
          ) : (
            data.type?.pathType === "conduit" &&
            data.type.conductorCount === null && (
              <div className="text-[#B45309] dark:text-[#F59E0B]">
                That run type has no conductor count, so homeruns add pipe and
                no wire.
              </div>
            )
          )}
          {data.noExtraSet && (
            <div className="text-muted-foreground">
              No waste set for this type or the company — none is added.
            </div>
          )}
          <div className="text-muted-foreground">
            Routing and waste add (15% + 10% = 25%); waste is on material only;
            5 ft of makeup per wire at the panel. They reach the bid when that
            run type is sent to it.
          </div>
        </>
      )}
      {confirmable.length > 0 && !locked && (
        <Button
          size="sm"
          variant="outline"
          className="min-h-11 w-full text-xs gap-1"
          onClick={() => onConfirmAll(confirmable)}
        >
          <Check className="w-3.5 h-3.5" /> Confirm {confirmable.length} on this
          sheet
        </Button>
      )}
    </div>
  );
}

/** One circuit's homerun, under its row. */
export function HomerunLine({
  row,
  panel,
  expanded,
  locked,
  onUpdate,
}: {
  row: HomerunRowData | null;
  panel: string;
  expanded: boolean;
  locked: boolean;
  onUpdate: (patch: {
    overrideFt?: number | null;
    ceilingInches?: number | null;
    confirmed?: boolean;
  }) => void;
}) {
  if (!row)
    return (
      <div className="text-xs text-muted-foreground">Homerun: reading…</div>
    );
  const f = row.footage;
  if (f.state === "traced")
    return (
      <div className="text-xs text-muted-foreground">
        Homerun: traced on the drawing — the trace is priced, not a computed
        one.
      </div>
    );
  const status =
    f.state === "computed" ? (
      f.confirmed ? (
        <span className="text-[#0D9488]">confirmed</span>
      ) : (
        <span className="text-[#B45309] dark:text-[#F59E0B]">unconfirmed</span>
      )
    ) : null;
  return (
    <div className="text-xs space-y-1" onClick={e => e.stopPropagation()}>
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          {f.state === "computed" ? (
            <>
              Homerun {homerunBreakdown(f)} · {status}
            </>
          ) : (
            <span className="text-[#B45309] dark:text-[#F59E0B]">
              Homerun: {refusalText(f.reason, panel)}
            </span>
          )}
          <div className="text-muted-foreground">
            {methodText(row.method)} · ceiling{" "}
            {row.ceiling.inches === null
              ? "not set — no drops"
              : `${formatElevation(row.ceiling.inches)} from ${CEILING_FROM[row.ceiling.source] ?? row.ceiling.source}`}
          </div>
        </div>
        {f.state === "computed" && !f.confirmed && !locked && (
          <Button
            size="sm"
            variant="outline"
            className="min-h-11 text-xs shrink-0"
            onClick={() => onUpdate({ confirmed: true })}
          >
            Confirm
          </Button>
        )}
      </div>
      {expanded && !locked && (
        <div className="rounded border border-border p-2 space-y-2">
          <div className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-muted-foreground">Length</span>
            <InlineNumberField
              value={row.overrideFt}
              whenUnset={{ placeholder: "computed" }}
              ariaLabel={`Typed homerun length, ${panel}-${row.circuitNumber}`}
              suffix="ft"
              rules={{ min: 0, max: 10000 }}
              onSave={v => onUpdate({ overrideFt: v })}
              onClear={() => onUpdate({ overrideFt: null })}
            />
          </div>
          <div className="flex items-start gap-2">
            <span className="w-16 shrink-0 pt-2 text-muted-foreground">
              Ceiling
            </span>
            <HeightFields
              value={row.ceilingInches}
              belowFloor={false}
              ariaPrefix={`Homerun ${panel}-${row.circuitNumber} ceiling`}
              compact
              setLabel="Override"
              clearLabel="Clear"
              unsetLabel={
                row.ceiling.inches === null
                  ? "not set — no drops"
                  : `follows ${CEILING_FROM[row.ceiling.source] ?? row.ceiling.source}, ${formatElevation(row.ceiling.inches)}`
              }
              onSave={inches => onUpdate({ ceilingInches: inches })}
              onClear={() => onUpdate({ ceilingInches: null })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
