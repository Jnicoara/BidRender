/**
 * Company heights: the elevations every vertical is measured from.
 *
 * ── The distribution height is the gate, and it sits alone at the top ────────
 * A vertical is the distance between two elevations. Until the height the pipe
 * runs at is entered, only one of them is ever known, so nothing is counted
 * anywhere whatever the device heights say. One number turns the whole feature
 * on, and until it is set the app counts exactly what it counted before.
 *
 * So it is not a row in the list. It is the first thing on the screen, and when
 * it is empty the screen says so in words rather than leaving a blank field to
 * be noticed.
 *
 * ── Zero and "not set" are different here, and that inverts a house rule ─────
 * `references/writing-style.md` § 8 says a price nobody set shows $0 and is
 * flagged, because blank reads as "not applicable". Heights cannot do that:
 * 0'-0" is a real, correct height for a floor box. So an unset height shows the
 * WORDS "not set — no vertical counted" and never a zero, and the fields do not
 * appear until somebody asks for them.
 *
 * ── Feet and inches, in two fields ───────────────────────────────────────────
 * One field would have to parse 10'-6", 10' 6", 10.5 and 126 and be right every
 * time; the failure is silent and it is measured in feet. Two fields cannot be
 * misread. `18` typed into a below-floor row is the same trap, which is why
 * those rows ask for a DEPTH and apply the sign themselves.
 *
 * ── The fold hides ours, never theirs ────────────────────────────────────────
 * See `CLAUDE.md` § Customization available, but never in the way. A type the
 * estimator added is always visible; only shipped types the trade meets rarely
 * sit behind "show all".
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Plus, Ruler } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HeightFields } from "@/components/HeightFields";
import { CompanyDefaultNotice } from "@/components/CompanyDefaultNotice";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { formatFeetInches } from "@shared/takeoffGeometry";
import type { HeightRow } from "@shared/takeoffHeights";

/**
 * What to call the level a number came from, in the estimator's words.
 *
 * Empty when nothing is set, on purpose: the CONTROL already says "not set —
 * no vertical counted", and it is the actionable spot. Saying it here as well
 * puts the same two words twice on one row, which reads as noise rather than
 * as emphasis.
 */
function sourceLabel(row: HeightRow): string {
  if (row.source === "job") return "this job";
  if (row.source === "company") return "yours";
  if (row.source === "shipped") return "starter";
  return "";
}

function HeightRowView({
  row,
  onSave,
  onReset,
  onRetire,
}: {
  row: HeightRow;
  onSave: (inches: number) => void;
  onReset: () => void;
  onRetire: (retired: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0">
      <div className="min-w-0 flex-1">
        <div className="text-sm flex items-center gap-2">
          <span className={row.isActive ? "" : "text-muted-foreground"}>
            {row.label}
          </span>
          {!row.isActive && (
            <span className="text-[0.7rem] text-muted-foreground border border-border rounded px-1">
              retired
            </span>
          )}
        </div>
        <div className="text-[0.7rem] text-muted-foreground">
          {row.heightInches !== null && (
            <span className="font-mono mr-2">
              {formatFeetInches(row.heightInches)}
            </span>
          )}
          <span>{sourceLabel(row)}</span>
          {row.note && row.source === "shipped" && <span> · {row.note}</span>}
        </div>
      </div>

      <HeightFields
        value={row.heightInches}
        belowFloor={row.belowFloor}
        ariaPrefix={row.label}
        onSave={onSave}
        // Reset is only offered where there is something to fall back to. A
        // company's own type has nothing behind it, so it is retired instead.
        onClear={
          row.isShipped && row.source !== "shipped" ? onReset : undefined
        }
      />

      <Button
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[0.7rem] text-muted-foreground shrink-0"
        onClick={() => onRetire(row.isActive)}
      >
        {row.isActive ? "Retire" : "Restore"}
      </Button>
    </div>
  );
}

export function HeightsSection() {
  const utils = trpc.useUtils();
  const query = trpc.takeoffHeights.company.useQuery();
  const [showAll, setShowAll] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");

  const refresh = () => utils.takeoffHeights.company.invalidate();
  const onError = (error: { message: string }) => toast.error(error.message);

  const setDistribution =
    trpc.takeoffHeights.setCompanyDistribution.useMutation({
      onSuccess: refresh,
      onError,
    });
  const setHeight = trpc.takeoffHeights.setCompanyHeight.useMutation({
    onSuccess: refresh,
    onError,
  });
  const resetToShipped = trpc.takeoffHeights.resetToShipped.useMutation({
    onSuccess: refresh,
    onError,
  });
  const setRetired = trpc.takeoffHeights.setTypeRetired.useMutation({
    onSuccess: refresh,
    onError,
  });
  const addType = trpc.takeoffHeights.addType.useMutation({
    onSuccess: () => {
      setNewLabel("");
      setAdding(false);
      refresh();
    },
    onError,
  });

  if (!query.data) return null;
  const { distributionHeight, types, bidsInheriting } = query.data;

  const visible = types.filter(row => row.common && row.isActive);
  const folded = types.filter(row => !row.common || !row.isActive);

  return (
    <section className="space-y-6">
      <div className="space-y-2">
        {/*
          The heading and the line under it must not restate the page blurb
          above them — writing-style § 10. That blurb already says what these
          numbers are FOR; this says where they are set and where they can be
          departed from.
        */}
        <h2 className="text-base font-medium">Mounting heights</h2>
        <p className="text-sm text-muted-foreground">
          Set once here, and overridden on a job or on a single run where the
          building does not match.
        </p>
        <CompanyDefaultNotice>
          Changing a height here re-prices every bid that has not set its own —{" "}
          {bidsInheriting} {bidsInheriting === 1 ? "bid" : "bids"} right now,
          including ones already sent.
        </CompanyDefaultNotice>
      </div>

      {/* The gate. Alone at the top, because nothing below it counts until
          this is set. */}
      <div className="rounded-md border border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Ruler className="w-4 h-4 text-muted-foreground" />
          <Label className="text-sm">Distribution height</Label>
        </div>
        <p className="text-xs text-muted-foreground">
          The elevation the pipe actually runs at — at the ceiling, above it, or
          at the deck. Not the ceiling height unless that is where the pipe is.
        </p>
        <HeightFields
          value={distributionHeight.inches}
          belowFloor={false}
          ariaPrefix="Distribution height"
          onSave={inches => setDistribution.mutate({ inches })}
          onClear={
            distributionHeight.inches !== null
              ? () => setDistribution.mutate({ inches: null })
              : undefined
          }
          clearLabel="Clear"
        />
        {distributionHeight.inches === null && (
          <p className="text-xs text-[#F5C518]">
            No vertical footage is being counted on any job. Set this and the
            heights below start adding drops and rises to your runs.
          </p>
        )}
      </div>

      <div>
        <div className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-1">
          Common
        </div>
        {visible.map(row => (
          <HeightRowView
            key={row.typeKey}
            row={row}
            onSave={inches =>
              setHeight.mutate({ typeKey: row.typeKey, inches })
            }
            onReset={() => resetToShipped.mutate({ typeKey: row.typeKey })}
            onRetire={retired =>
              setRetired.mutate({ typeKey: row.typeKey, retired })
            }
          />
        ))}

        {folded.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 mt-1 px-1 text-xs text-muted-foreground"
            onClick={() => setShowAll(v => !v)}
          >
            {showAll ? (
              <ChevronDown className="w-3 h-3 mr-1" />
            ) : (
              <ChevronRight className="w-3 h-3 mr-1" />
            )}
            {showAll
              ? "Show fewer"
              : `Show all heights (${folded.length} more)`}
          </Button>
        )}

        {showAll &&
          folded.map(row => (
            <HeightRowView
              key={row.typeKey}
              row={row}
              onSave={inches =>
                setHeight.mutate({ typeKey: row.typeKey, inches })
              }
              onReset={() => resetToShipped.mutate({ typeKey: row.typeKey })}
              onRetire={retired =>
                setRetired.mutate({ typeKey: row.typeKey, retired })
              }
            />
          ))}
      </div>

      {/* Adding a type is permanent and company-wide. A one-off number for one
          run is a different control, worded differently, on the run itself. */}
      {adding ? (
        <div className="flex items-center gap-2">
          <Input
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onFocus={selectOnFocus}
            placeholder="Exit sign"
            className="h-8 w-48 text-sm"
            aria-label="Name of the new height type"
            autoFocus
          />
          <Button
            size="sm"
            className="h-8"
            disabled={newLabel.trim().length === 0}
            onClick={() =>
              addType.mutate({ label: newLabel.trim(), inches: null })
            }
          >
            Add
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8"
            onClick={() => {
              setNewLabel("");
              setAdding(false);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          onClick={() => setAdding(true)}
        >
          <Plus className="w-3 h-3 mr-1" />
          Add a type
        </Button>
      )}

      <p className="text-xs text-muted-foreground">
        The starter values are common conventions, not measurements from your
        jobs. Panels and ceiling boxes ship with no height at all, because how
        far a pipe drops into one depends on how it is set.
      </p>
    </section>
  );
}
