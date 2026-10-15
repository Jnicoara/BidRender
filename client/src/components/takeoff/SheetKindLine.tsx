/**
 * "What is this sheet?" — the line beside the sheet name and its card
 * (references/plan-reading-help-plan.md § 4; step 3 of § 7).
 *
 * The line reads "Lighting plan · count fixtures and switches" and opens the
 * card: what to do on a sheet like this, and what to watch for. It is shown
 * ONLY when the title says what the sheet is (shared/planHelp/sheetKind.ts);
 * an unrecognised sheet shows nothing, never "Unknown sheet". A title naming
 * several kinds leads with one and the card lists the rest — never one
 * guessed and the other hidden.
 *
 * It explains; it does not act. Nothing is stored, tagged, counted or priced
 * — the one button it carries opens the existing Schedules view, and only
 * where the sheet's schedule was read and that view is on screen.
 *
 * Laptop and tablet: a popover. Phone: the same card as a sheet along the
 * bottom of the screen (plan § 1, "Where each piece lives").
 */
import { useState } from "react";
import { BookOpen, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  sheetKindCard,
  sheetKinds,
  type SheetKind,
  type SheetKindCard,
} from "@shared/planHelp/sheetKind";

/** What the card may point at on this sheet. */
type CardContext = {
  /** True when the sheet is already set to Demo (or Demo and new). */
  demoSet?: boolean;
  /**
   * Open the sheet's Schedules view. Given only when the reader found a
   * schedule on this sheet AND that view is on screen (not on a phone).
   */
  onOpenSchedules?: () => void;
};

export function SheetKindLine({
  title,
  phone,
  compact,
  tablet,
  ...context
}: {
  /** The sheet's title as the sheet list shows it. */
  title: string | null;
  phone: boolean;
  /** Not a laptop: the hint is dropped, the label stays. */
  compact: boolean;
  /**
   * A tablet. Beside the sheet chip the line pushed a control onto a new row
   * of the (already wrapping) top bar — 50 px of drawing gone, measured
   * 2026-10-13 (iPad portrait 209 -> 259 px). There it goes just before the
   * bar's last group (scale, zoom), which the page also orders last; the
   * row before that group has room for it.
   */
  tablet: boolean;
} & CardContext) {
  const [open, setOpen] = useState(false);
  const kinds = sheetKinds(title);
  const lead = kinds.length > 0 ? sheetKindCard(kinds[0]) : null;
  if (!lead) return null;

  const trigger = (
    <button
      type="button"
      onClick={phone ? () => setOpen(true) : undefined}
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 rounded px-1.5 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50",
        tablet && "order-last"
      )}
      data-plan-tip="sheet-kind"
      title={`${lead.label} — what to do on this sheet`}
      aria-label={`${lead.label}: what to do on this sheet`}
    >
      <BookOpen className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">
        <span className="text-foreground">{lead.label}</span>
        {/* The hint is the first thing to go on a narrow bar. */}
        {!compact && <span> · {lead.hint}</span>}
      </span>
    </button>
  );

  const body = (
    <SheetKindCardBody
      kinds={kinds}
      {...context}
      onOpenSchedules={
        context.onOpenSchedules
          ? () => {
              setOpen(false);
              context.onOpenSchedules?.();
            }
          : undefined
      }
    />
  );

  if (phone)
    return (
      <>
        {trigger}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="top-auto bottom-0 left-0 translate-x-0 translate-y-0 w-full max-w-none sm:max-w-none rounded-b-none max-h-[80dvh] overflow-y-auto p-4 gap-2">
            <DialogTitle className="sr-only">What is this sheet?</DialogTitle>
            <DialogDescription className="sr-only">
              Read from the sheet&rsquo;s title.
            </DialogDescription>
            {body}
          </DialogContent>
        </Dialog>
      </>
    );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        collisionPadding={8}
        className="w-[min(22rem,calc(100vw-1rem))] max-h-[min(32rem,80dvh)] overflow-y-auto p-3"
      >
        {body}
      </PopoverContent>
    </Popover>
  );
}

/**
 * The card itself — what the line opens, and what "All sheet kinds" under
 * More options shows for each kind. One component for both, so the two
 * cannot drift (CLAUDE.md § "Copying a layout does not copy the behaviour").
 */
export function SheetKindCardBody({
  kinds,
  demoSet,
  onOpenSchedules,
  showFrom = true,
}: {
  /** The lead kind first, then any others the title names. */
  kinds: SheetKind[];
  /** Under More options there is no sheet, so no "read from the title". */
  showFrom?: boolean;
} & CardContext) {
  const [shown, setShown] = useState<SheetKind>(kinds[0]);
  const card = sheetKindCard(kinds.includes(shown) ? shown : kinds[0]);
  if (!card) return null;
  const others = kinds.filter(k => k !== card.kind);
  const schedule =
    card.kind === "panelSchedule" || card.kind === "fixtureSchedule";

  return (
    <div className="space-y-2 text-xs">
      <div>
        <p className="text-sm font-semibold">{card.label}</p>
        {showFrom && (
          <p className="text-muted-foreground">
            From the sheet&rsquo;s title. This set&rsquo;s own notes win.
          </p>
        )}
      </div>

      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-muted-foreground">Also on this sheet:</span>
          {others.map(k => (
            <button
              key={k}
              type="button"
              onClick={() => setShown(k)}
              className="rounded border border-border px-1.5 py-0.5 hover:bg-muted/50"
            >
              {sheetKindCard(k)?.label ?? k}
            </button>
          ))}
        </div>
      )}

      <CardSection heading="What to do here" lines={card.whatToDo} />
      <CardSection heading="Watch for" lines={card.watchFor} />

      {card.kind === "demolition" && demoSet && (
        <p className="text-muted-foreground">
          This sheet is already set to Demo.
        </p>
      )}

      {schedule && onOpenSchedules && (
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 text-xs"
          onClick={onOpenSchedules}
        >
          <Table2 className="w-3.5 h-3.5" />
          Open this sheet&rsquo;s schedules
        </Button>
      )}
    </div>
  );
}

function CardSection({
  heading,
  lines,
}: {
  heading: string;
  lines: SheetKindCard["whatToDo"];
}) {
  return (
    <section>
      <h4 className="text-[0.7rem] uppercase tracking-wide text-muted-foreground mb-0.5">
        {heading}
      </h4>
      <ul className="list-disc pl-4 space-y-0.5">
        {lines.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </section>
  );
}
