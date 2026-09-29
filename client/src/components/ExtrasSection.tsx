/**
 * Company EXTRA and MAKEUP — references/track-b-held-migrations-plan.md § 1.
 *
 * Three quantities, three units, and the screen keeps them apart because a
 * tidy-up that merged them would be wrong twice (plan-viewer-overhaul.md § 2.2,
 * § 5j, § 7.1):
 *
 *   conduit extra   a percentage of the RUN LENGTH only
 *   wire extra      a percentage of the run length AND its drops
 *   makeup          inches per conductor at each END — never a percentage
 *
 * ── The starters apply NOTHING until accepted (owner, 2026-09-28, Q1) ────────
 * CLAUDE.md § Starter content: a shipped number is shown, dated, and inert
 * until somebody clicks Accept. So the block that offers them says what they
 * are, when they were set, that they are conventions, and — before anything
 * moves — how many bids accepting will change.
 *
 * ── Extra is MATERIAL ONLY; makeup carries labour (Q5) ───────────────────────
 * Said on this screen in words, because it decides what an estimator expects
 * the hours to do when these numbers move.
 *
 * Every field is a self-saving `InlineNumberField` with a placeholder naming
 * what applies when it is empty — "starter 10%" or "not set" — never a zero
 * (CLAUDE.md § Editing fields, rule 6).
 */
import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { InlineNumberField } from "@/components/InlineNumberField";
import { CompanyDefaultNotice } from "@/components/CompanyDefaultNotice";
import { asPercent, fromPercent } from "@/lib/inlineEdit";
import type { ResolvedExtra } from "@shared/runExtras";

/** "10%", "18 in (1'-6")", in the estimator's words. */
function pctText(fraction: number) {
  return `${Math.round(fraction * 10000) / 100}%`;
}
function inchesText(inches: number) {
  const feet = Math.floor(inches / 12);
  const rest = inches % 12;
  if (inches < 12) return `${inches} in`;
  return rest === 0
    ? `${inches} in (${feet} ft)`
    : `${inches} in (${feet}'-${rest}")`;
}

/** What an empty field falls back to, as its placeholder. */
function fallback(resolved: ResolvedExtra, format: (n: number) => string) {
  if (resolved.source === "starter" && resolved.value !== null)
    return `starter ${format(resolved.value)}`;
  return "not set";
}

export function ExtrasSection() {
  const utils = trpc.useUtils();
  const query = trpc.takeoffHeights.extras.useQuery();
  const heights = trpc.takeoffHeights.company.useQuery();
  const [byType, setByType] = useState(false);

  const refresh = () => utils.takeoffHeights.extras.invalidate();
  const onError = (error: { message: string }) => toast.error(error.message);
  const setExtras = trpc.takeoffHeights.setExtras.useMutation({
    onSuccess: refresh,
    onError,
  });
  const accept = trpc.takeoffHeights.acceptExtraStarters.useMutation({
    onSuccess: refresh,
    onError,
  });
  const setTypeMakeup = trpc.takeoffHeights.setTypeMakeup.useMutation({
    onSuccess: refresh,
    onError,
  });

  if (!query.data) return null;
  const {
    stored,
    effective,
    starters,
    acceptedAt,
    bidsAffected,
    makeupByType,
  } = query.data;
  const bids = `${bidsAffected} ${bidsAffected === 1 ? "bid" : "bids"}`;
  const typesWithMakeup = Object.values(makeupByType).filter(
    m => m.makeupAt !== null || m.makeupInches !== null
  ).length;

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-base font-medium">Extra and makeup</h2>
        <p className="text-sm text-muted-foreground">
          What a job buys beyond the measured length. Set here, changed on a run
          type or a single run where it differs.
        </p>
        <CompanyDefaultNotice>
          Changing these re-prices every bid that still follows its drawing —{" "}
          {bids} right now. A bid with locked quantities keeps its numbers.
        </CompanyDefaultNotice>
      </div>

      {/* The starters: shown, dated, and inert until accepted (Q1). */}
      {!stored.accepted ? (
        <div className="rounded-md border border-border p-3 space-y-2">
          <div className="text-sm font-medium">
            Starter values — verify against your own work
          </div>
          <p className="text-xs text-muted-foreground">
            Conduit extra {pctText(starters.conduitExtraPct)} · wire extra{" "}
            {pctText(starters.wireExtraPct)} · makeup{" "}
            {starters.makeupDeviceInches} in per wire at a box,{" "}
            {starters.makeupPanelInches / 12} ft at a panel. Common conventions,
            set {starters.date}, not measured from your jobs.{" "}
            <span className="text-foreground">
              They add nothing to any bid until you accept them.
            </span>
          </p>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              className="h-8"
              disabled={accept.isPending}
              onClick={() => accept.mutate({ accept: true })}
            >
              Accept starters
            </Button>
            <span className="text-xs text-muted-foreground">
              Accepting changes the wire and pipe on {bids} that still follow
              the drawing.
            </span>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Starters accepted
          {acceptedAt ? ` ${new Date(acceptedAt).toLocaleDateString()}` : ""}.
          Any value you set below wins over them.{" "}
          <button
            className="underline hover:text-foreground"
            onClick={() => accept.mutate({ accept: false })}
          >
            Withdraw
          </button>
        </p>
      )}

      <div className="space-y-1.5">
        <ExtraRow
          label="Conduit extra"
          hint="of the run length only — not the drops"
          suffix="%"
          value={
            stored.conduitExtraPct === null
              ? null
              : asPercent(stored.conduitExtraPct)
          }
          placeholder={fallback(effective.conduitExtraPct, pctText)}
          max={100}
          onSave={v => setExtras.mutate({ conduitExtraPct: fromPercent(v) })}
          onClear={() => setExtras.mutate({ conduitExtraPct: null })}
        />
        <ExtraRow
          label="Wire extra"
          hint="of the run length and its drops"
          suffix="%"
          value={
            stored.wireExtraPct === null ? null : asPercent(stored.wireExtraPct)
          }
          placeholder={fallback(effective.wireExtraPct, pctText)}
          max={100}
          onSave={v => setExtras.mutate({ wireExtraPct: fromPercent(v) })}
          onClear={() => setExtras.mutate({ wireExtraPct: null })}
        />
        <ExtraRow
          label="Makeup at a box"
          hint="per wire, at each end"
          suffix="in"
          value={stored.makeupDeviceInches}
          placeholder={fallback(effective.makeupDeviceInches, inchesText)}
          max={240}
          onSave={v => setExtras.mutate({ makeupDeviceInches: Math.round(v) })}
          onClear={() => setExtras.mutate({ makeupDeviceInches: null })}
        />
        <ExtraRow
          label="Makeup at a panel"
          hint="per wire, at a panel end"
          suffix="in"
          value={stored.makeupPanelInches}
          placeholder={fallback(effective.makeupPanelInches, inchesText)}
          max={240}
          onSave={v => setExtras.mutate({ makeupPanelInches: Math.round(v) })}
          onClear={() => setExtras.mutate({ makeupPanelInches: null })}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        Extra is material only — it is bought, and the bid puts no install hours
        on it. Makeup is installed wire, so it carries hours at the run's own
        rate.
      </p>

      {/* One fold: makeup for a particular height type. Most companies never
          open it; a type with a figure set keeps it open (CLAUDE.md §
          Customization — hide ours, never theirs). */}
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-1 text-xs text-muted-foreground"
          onClick={() => setByType(v => !v)}
        >
          {byType || typesWithMakeup > 0 ? (
            <ChevronDown className="w-3 h-3 mr-1" />
          ) : (
            <ChevronRight className="w-3 h-3 mr-1" />
          )}
          Makeup at a particular type
          {typesWithMakeup > 0 ? ` (${typesWithMakeup} set)` : ""}
        </Button>
        {(byType || typesWithMakeup > 0) && heights.data && (
          <div className="mt-1 space-y-1">
            {heights.data.types
              .filter(t => t.isActive && t.typeKey !== "distribution")
              .map(t => {
                const own = makeupByType[t.typeKey] ?? {
                  makeupAt: null,
                  makeupInches: null,
                };
                const isPanel =
                  own.makeupAt === "panel" ||
                  (own.makeupAt === null && t.typeKey === "panel");
                return (
                  <div
                    key={t.typeKey}
                    className="flex items-center justify-between gap-2 text-xs"
                  >
                    <span className="text-muted-foreground">{t.label}</span>
                    <span className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={isPanel}
                          onChange={e =>
                            setTypeMakeup.mutate({
                              typeKey: t.typeKey,
                              makeupAt: e.target.checked ? "panel" : "device",
                            })
                          }
                          aria-label={`${t.label} is a panel end`}
                        />
                        panel end
                      </label>
                      <InlineNumberField
                        value={own.makeupInches}
                        whenUnset={{
                          placeholder: isPanel ? "panel figure" : "box figure",
                        }}
                        rules={{ min: 0, max: 240 }}
                        onSave={v =>
                          setTypeMakeup.mutate({
                            typeKey: t.typeKey,
                            makeupInches: Math.round(v),
                          })
                        }
                        onClear={() =>
                          setTypeMakeup.mutate({
                            typeKey: t.typeKey,
                            makeupInches: null,
                          })
                        }
                        ariaLabel={`Makeup at ${t.label}, inches`}
                        suffix="in"
                        className="w-24"
                      />
                    </span>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </section>
  );
}

function ExtraRow(props: {
  label: string;
  hint: string;
  suffix: string;
  value: number | null;
  placeholder: string;
  max: number;
  onSave: (value: number) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm">{props.label}</div>
        <div className="text-xs text-muted-foreground">{props.hint}</div>
      </div>
      <InlineNumberField
        value={props.value}
        whenUnset={{ placeholder: props.placeholder }}
        rules={{ min: 0, max: props.max }}
        onSave={props.onSave}
        onClear={props.onClear}
        ariaLabel={props.label}
        suffix={props.suffix}
        className="w-32"
      />
    </div>
  );
}
