/**
 * "Who does this?" on one bid line — the "…" beside the line's remove X, and
 * the chip a TAGGED line shows under its name (0146; scope-tags-plan.md
 * step 3, owner Q2). Both open the same menu, so there is one control.
 *
 * ── Quiet by default ─────────────────────────────────────────────────────────
 * A line nobody has answered (NULL) and one answered "We install" show NO
 * chip: that is how every line has always priced, and a chip on every row
 * would be clutter on the basic path. Only Owner furnishes, By others and
 * Excluded say so, because those are the ones that change the money.
 *
 * ── Locked bid ───────────────────────────────────────────────────────────────
 * No "…" at all, and the chip is read-only with the reason on tap: a locked
 * bid's numbers must not move (owner Q1), and a menu whose every choice is
 * refused is a dead end.
 */
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TapExplain } from "@/components/TapExplain";
import { cn } from "@/lib/utils";
import {
  isLineScope,
  scopeChoicesFor,
  scopeLabel,
  scopeOf,
  type LineScope,
} from "@shared/lineScope";

type Line = {
  id: number;
  name: string;
  lineRole: string | null;
  scopeTag: LineScope | null;
};

/** What each choice does to the money — said in the menu, not discovered. */
const CHOICE_HINT: Record<LineScope, string> = {
  install: "Material and labor in your price",
  ofci: "Labor only — the owner supplies the material",
  by_others: "Not in your price, off your materials list",
  excluded: "Not in your price, off your materials list",
};

function ScopeChoices({
  line,
  onPick,
}: {
  line: Line;
  onPick: (scope: LineScope) => void;
}) {
  return (
    <DropdownMenuContent align="end" className="w-64">
      <DropdownMenuLabel>Who does this?</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={scopeOf(line)}
        onValueChange={value => {
          if (isLineScope(value) && value !== scopeOf(line)) onPick(value);
        }}
      >
        {scopeChoicesFor(line).map(scope => (
          <DropdownMenuRadioItem key={scope} value={scope} className="py-2">
            <span className="flex flex-col">
              <span>{scopeLabel(scope)}</span>
              <span className="text-xs text-muted-foreground">
                {CHOICE_HINT[scope]}
              </span>
            </span>
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  );
}

/** The chip under a tagged line's name. Nothing on We install / not said. */
export function LineScopeChip({
  line,
  locked,
  onPick,
}: {
  line: Line;
  locked: boolean;
  onPick: (scope: LineScope) => void;
}) {
  const scope = scopeOf(line);
  if (scope === "install") return null;
  const chipClass =
    "inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground";
  if (locked) {
    return (
      <TapExplain
        explanation="The bid is locked; unlock it to change who does this."
        className={chipClass}
      >
        {scopeLabel(scope)}
      </TapExplain>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(chipClass, "hover:bg-muted/40")}
          aria-label={`${scopeLabel(scope)} — change who does ${line.name}`}
        >
          {scopeLabel(scope)}
        </button>
      </DropdownMenuTrigger>
      <ScopeChoices line={line} onPick={onPick} />
    </DropdownMenu>
  );
}

/** The "…" beside the remove X. Absent on a locked bid. */
export function LineScopeMenuButton({
  line,
  locked,
  onPick,
}: {
  line: Line;
  locked: boolean;
  onPick: (scope: LineScope) => void;
}) {
  if (locked) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 w-7 p-0 shrink-0 text-muted-foreground"
          aria-label={`Who does ${line.name}?`}
        >
          <MoreHorizontal className="w-3.5 h-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <ScopeChoices line={line} onPick={onPick} />
    </DropdownMenu>
  );
}
