/**
 * "Example price" / "Example hours" / "Example rate" on a bid line — the
 * owner's rule (2026-10-07): on the shop's OWN bid screen only, never on the
 * customer quote. Read from the line's FROZEN flags (shared/exampleTags.ts),
 * so it says what the line was priced with when it was added, and a later
 * edit of the library cannot make an old line lie.
 *
 * Deliberately NOT the amber of "Not priced": an example number is a real
 * price, just not the shop's own. Sky, small, with the reason on hover.
 */
import { cn } from "@/lib/utils";
import { TapExplain } from "./TapExplain";
import {
  EXAMPLE_LABEL,
  lineExampleKinds,
  type ExampleKind,
  type LineExampleFlags,
} from "@shared/exampleTags";

const WHY: Record<ExampleKind, string> = {
  price:
    "Priced from BidRidge's example price for this item, not one you set. Set your own on the Materials screen.",
  hours:
    "Uses BidRidge's example labor hours, not yours. Set your own hours on the item or assembly.",
  rate: "Uses BidRidge's example labor rate, not your shop's. Set your own loaded rate in Settings › Labor rates.",
};

export function ExampleTags({
  line,
  only,
  className,
}: {
  line: LineExampleFlags;
  /** Show just these kinds — e.g. the hours cell shows hours and rate. */
  only?: readonly ExampleKind[];
  className?: string;
}) {
  const kinds = lineExampleKinds(line).filter(k => !only || only.includes(k));
  if (kinds.length === 0) return null;
  return (
    <span className={cn("inline-flex flex-wrap gap-1", className)}>
      {kinds.map(kind => (
        // Tap or hover — a `title` alone never reaches a tablet.
        <TapExplain
          key={kind}
          explanation={WHY[kind]}
          className="rounded border border-sky-500/40 px-1 text-[10px] leading-4 text-sky-400 whitespace-nowrap no-underline"
        >
          {EXAMPLE_LABEL[kind]}
        </TapExplain>
      ))}
    </span>
  );
}
