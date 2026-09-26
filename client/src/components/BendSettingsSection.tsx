/**
 * Company bend settings: when a bend takes a factory elbow, how many degrees
 * a pull may turn, and when a pull point is a box rather than an LB.
 *
 * ── Behind a fold, because the defaults are right for most companies ─────────
 * CLAUDE.md § "Customization available, but never in the way": the common few
 * visible, the rest behind ONE control. These three are set once, if ever, so
 * the closed fold still says what is in effect — "Factory elbows from 1-1/4"
 * · pull point past 360° · pull box from 2"" — and nobody has to open it to
 * find out what the app is counting with.
 *
 * ── Every value says whether it is ours or theirs ────────────────────────────
 * NULL is "the shipped default", so a later change to a default reaches every
 * company that never chose one. The picker offers the default by name, marked
 * "(default)", and choosing it writes NULL rather than a copy of today's value.
 *
 * ── A company default, so it carries the warning ─────────────────────────────
 * These recount elbows, field bends and pull points on every job — the same
 * reach as a mounting height, which is why the notice here reads the same way.
 */
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CompanyDefaultNotice } from "@/components/CompanyDefaultNotice";
import { resolveBendSettings } from "@shared/runBends";

/** The value the picker uses for "go back to the shipped default". */
const DEFAULT = "default";

type Stored = {
  factoryElbowFromSize: string | null;
  pullPointLimitDegrees: number | null;
  pullBoxFromSize: string | null;
};

export function BendSettingsSection() {
  const utils = trpc.useUtils();
  const query = trpc.takeoffHeights.bends.useQuery();
  const [open, setOpen] = useState(false);

  /*
    Optimistic, like every simple edit (CLAUDE.md § Responsiveness 1): the
    picker shows the choice at once and the write goes out behind it. The
    whole payload is recomputed from the stored values so "effective" never
    disagrees with "stored" for the length of a round trip.
  */
  const setBends = trpc.takeoffHeights.setBends.useMutation({
    onMutate: async patch => {
      await utils.takeoffHeights.bends.cancel();
      const before = utils.takeoffHeights.bends.getData();
      if (before) {
        const stored: Stored = { ...before.stored, ...patch };
        utils.takeoffHeights.bends.setData(undefined, {
          ...before,
          stored,
          // The server's own resolver, so the two cannot disagree.
          effective: resolveBendSettings(stored),
        });
      }
      return { before };
    },
    onError: (error, _patch, context) => {
      if (context?.before)
        utils.takeoffHeights.bends.setData(undefined, context.before);
      toast.error(error.message);
    },
    onSettled: () => {
      utils.takeoffHeights.bends.invalidate();
      // Every screen that counts bends reads these through the bridge.
      utils.takeoffRunTypes.bridgeForBid.invalidate();
    },
  });

  if (!query.data) return null;
  const { stored, effective, defaults, sizes, limits } = query.data;

  const summary =
    `Factory elbows from ${effective.factoryElbowFrom} · ` +
    `pull point past ${effective.pullPointLimit}° · ` +
    `pull box from ${effective.pullBoxFrom}`;

  return (
    <section className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-auto px-1 py-1 -ml-1 flex items-start gap-1 text-left"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 mt-0.5 shrink-0" />
        )}
        <span className="flex flex-col">
          <span className="text-sm font-medium">Bends and pull points</span>
          <span className="text-xs text-muted-foreground font-normal whitespace-normal">
            {summary}
          </span>
        </span>
      </Button>

      {open && (
        <div className="space-y-4 pl-5">
          <CompanyDefaultNotice>
            Changing these recounts elbows, field bends and pull points on every
            job, including bids already sent. A bid with its quantities locked
            keeps the numbers it has.
          </CompanyDefaultNotice>

          <SettingRow
            label="Factory elbows from"
            help="Smaller pipe is bent in the field: labor only, priced from the hours per field bend on the pipe. PVC always takes factory elbows."
            value={stored.factoryElbowFromSize}
            fallback={defaults.factoryElbowFrom}
            choices={sizes.map(size => ({ value: size, label: size }))}
            onChange={value =>
              setBends.mutate({
                factoryElbowFromSize:
                  value === null ? null : (value as (typeof sizes)[number]),
              })
            }
          />
          <SettingRow
            label="Propose a pull point past"
            help="Degrees of bend between pull points, counted from the drawing's corners and drops. 360° is the code maximum; 270° leaves room for the kicks and offsets the plans do not show."
            value={
              stored.pullPointLimitDegrees === null
                ? null
                : String(stored.pullPointLimitDegrees)
            }
            fallback={String(defaults.pullPointLimit)}
            choices={limits.map(limit => ({
              value: String(limit),
              label: `${limit}°`,
            }))}
            onChange={value =>
              setBends.mutate({
                pullPointLimitDegrees:
                  value === null ? null : value === "270" ? 270 : 360,
              })
            }
          />
          <SettingRow
            label="Pull box instead of an LB from"
            help="What a proposed pull point offers first. You can switch it on the drawing when you accept one."
            value={stored.pullBoxFromSize}
            fallback={defaults.pullBoxFrom}
            choices={sizes.map(size => ({ value: size, label: size }))}
            onChange={value =>
              setBends.mutate({
                pullBoxFromSize:
                  value === null ? null : (value as (typeof sizes)[number]),
              })
            }
          />
        </div>
      )}
    </section>
  );
}

/**
 * One setting: the choices, with the shipped default named and marked. The
 * default is offered as its own entry that writes NULL, so picking it follows
 * any later change to the default instead of freezing today's value.
 */
function SettingRow({
  label,
  help,
  value,
  fallback,
  choices,
  onChange,
}: {
  label: string;
  help: string;
  /** The company's own choice, or null for the shipped default. */
  value: string | null;
  fallback: string;
  choices: { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  const fallbackLabel =
    choices.find(choice => choice.value === fallback)?.label ?? fallback;
  const id = `bend-setting-${label.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3">
        <Label htmlFor={id} className="text-sm w-56 shrink-0">
          {label}
        </Label>
        <Select
          // A stored copy of the default reads as the default: the picker has
          // no second entry for it, and would otherwise show nothing.
          value={value === null || value === fallback ? DEFAULT : value}
          onValueChange={next => onChange(next === DEFAULT ? null : next)}
        >
          <SelectTrigger id={id} className="h-8 w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={DEFAULT}>{fallbackLabel} (default)</SelectItem>
            {choices
              .filter(choice => choice.value !== fallback)
              .map(choice => (
                <SelectItem key={choice.value} value={choice.value}>
                  {choice.label}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}
