/**
 * ROUTE | QUANTITY — how the next trace is drawn (D21).
 *
 * A route is a real run: ends, drops, circuits. A quantity trace is flat
 * footage under the armed type — many legs into one bucket, with drops
 * proposed afterwards. Sticky per bid, like the ends pickers beside it.
 *
 * Locked once a trace has points: the mode is fixed when the run is first
 * saved, and a toggle that looked live mid-trace would be one that silently
 * did nothing. A finished run switches from its row in the panel.
 */
import { cn } from "@/lib/utils";
import type { TraceMode } from "@shared/traceMode";

const OPTIONS: { mode: TraceMode; label: string; title: string }[] = [
  {
    mode: "route",
    label: "Route",
    title: "Route — a real run with ends, drops and circuits",
  },
  {
    mode: "quantity",
    label: "Quantity",
    title:
      "Quantity — flat footage of this type, in as many legs as you like. No ends, no circuits; drops are proposed afterwards.",
  },
];

export function TraceModeToggle({
  value,
  onChange,
  locked,
}: {
  value: TraceMode;
  onChange: (next: TraceMode) => void;
  /** A trace is in progress; its mode is already decided. */
  locked: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="How this trace counts"
      className="flex items-center rounded-md border border-border p-0.5 text-xs"
    >
      {OPTIONS.map(option => {
        const on = option.mode === value;
        return (
          <button
            key={option.mode}
            type="button"
            role="radio"
            aria-checked={on}
            disabled={locked && !on}
            title={
              locked && !on
                ? "Finish or cancel this trace to change how it counts"
                : option.title
            }
            onClick={() => onChange(option.mode)}
            className={cn(
              "h-6 px-2 rounded-[5px] transition-colors",
              on
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
              "disabled:opacity-40 disabled:hover:text-muted-foreground"
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
