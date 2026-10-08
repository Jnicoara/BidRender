/**
 * A short piece of text with a "why" behind it, readable with a mouse AND a
 * finger (references/device-audit.md, "Left to do").
 *
 * A `title` attribute is hover-only: on a tablet or phone the explanation
 * simply does not exist. So the text is a button — hover still shows the
 * browser tooltip, and a tap (or click, or Enter) opens the same words in a
 * small popover. The dotted underline is the cue that there is more to read;
 * nothing else about the text changes, so the column it sits in keeps its
 * width and alignment.
 */
import type { ReactNode } from "react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export function TapExplain({
  explanation,
  className,
  children,
}: {
  explanation: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={explanation}
          /*
            Explaining is all a tap here does. Several of these sit inside a
            row that opens a bid on click (the Dashboard's bid cards, the
            profitability table), and without this the same tap would both
            open the explanation and navigate away from it.
          */
          onClick={e => e.stopPropagation()}
          className={cn(
            "underline decoration-dotted underline-offset-2 cursor-help",
            className
          )}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3 text-xs leading-snug">
        {explanation}
      </PopoverContent>
    </Popover>
  );
}
