/**
 * THE ONE PIN-LOOK EDITOR (pin plan § 6): a count's shape, letter and colour,
 * opened from its swatch. Each part can be Automatic, which is what nobody
 * has to configure (§ 5e) — the family's shape, the table letter, the first
 * free colour.
 *
 * Saved "on this job" (the count) or "on every job" (its legend symbol, else
 * its assembly — `takeoffGroups.setLook`). A count typed by name has no
 * library row, so the second choice is not offered and says why.
 *
 * A draft form with its own Save, so none of the inline-field rules about
 * saving as you type apply; the letter box selects on focus (rule 1).
 * Nothing here moves a number: a look is display only.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  MARK_COLORS,
  NEW_FILL_OPACITY,
  MARK_SHAPES,
  letterFit,
  markPath,
  type MarkColor,
  MARK_SHAPE_NAME,
  type MarkShape,
} from "@shared/takeoffMarks";
import { cleanLetter, type PinStyle } from "@shared/pinLetters";

export type PinLookSave = {
  shape: MarkShape | null;
  letter: string | null;
  color: MarkColor | null;
  where: "job" | "everyJob";
};

// One map with the takeoff CSV's "Pin" column (shared/takeoffMarks.ts).
const SHAPE_NAME = MARK_SHAPE_NAME;

const SOURCE_WORD = {
  count: "this job",
  symbol: "the legend symbol",
  assembly: "the assembly",
  automatic: "automatic",
} as const;

function Swatch({
  shape,
  color,
  letter,
  size = 22,
}: {
  shape: MarkShape;
  color: string;
  letter?: string | null;
  size?: number;
}) {
  const c = size / 2;
  const r = c - 2;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <path
        d={markPath(shape, c, c, r)}
        fill={color}
        fillOpacity={NEW_FILL_OPACITY}
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {letter && (
        <text
          x={c}
          y={c + letterFit(shape, r, letter).dy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={letterFit(shape, r, letter).size}
          fontWeight={700}
          className="fill-foreground"
        >
          {letter}
        </text>
      )}
    </svg>
  );
}

export function PinLookEditor({
  name,
  style,
  own,
  everyJob,
  busy,
  onSave,
  children,
}: {
  /** The count's name, for the heading. */
  name: string;
  /** What the pins look like now, and where each part came from. */
  style: PinStyle;
  /** What THIS count chose (NULL = not chosen here). The draft starts here. */
  own: { shape: string | null; letter: string | null; color: string | null };
  /**
   * The library row "every job" would save on, or why there is none.
   * `{ name }` → offered; `{ none: reason }` → shown, not offered.
   */
  everyJob: { name: string } | { none: string };
  busy: boolean;
  onSave: (look: PinLookSave) => void;
  /** The swatch the editor opens from. */
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const fromOwn = () => ({
    shape: (MARK_SHAPES as readonly string[]).includes(own.shape ?? "")
      ? (own.shape as MarkShape)
      : null,
    letter: own.letter ?? "",
    color: (MARK_COLORS as readonly string[]).includes(own.color ?? "")
      ? (own.color as MarkColor)
      : null,
  });
  const [draft, setDraft] = useState(fromOwn);
  const [where, setWhere] = useState<"job" | "everyJob">("job");
  const letterOk = draft.letter.trim() === "" || cleanLetter(draft.letter);
  const previewShape = draft.shape ?? style.shape;
  const previewColor = draft.color ?? style.color;
  const previewLetter = cleanLetter(draft.letter) ?? style.letter;

  return (
    <Popover
      open={open}
      onOpenChange={next => {
        if (next) {
          setDraft(fromOwn());
          setWhere("job");
        }
        setOpen(next);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="shrink-0 rounded-sm outline-offset-2 hover:ring-1 hover:ring-border"
          aria-label={`Change how ${name} pins look`}
          title="Change how these pins look — shape, letter, color"
        >
          {children}
        </button>
      </PopoverTrigger>
      {/*
        Opens to the LEFT, over the drawing, and never taller than the room
        Radix says there is: on a tablet the touch-sized buttons made it
        taller than the space above or below the swatch, and its heading was
        cut off the top of the screen (seen at 1180x820, 2026-10-05).
      */}
      <PopoverContent
        className="w-72 p-3 space-y-3 overflow-y-auto max-h-[var(--radix-popover-content-available-height)]"
        side="left"
        align="start"
        collisionPadding={8}
      >
        <div className="flex items-center gap-2">
          <Swatch
            shape={previewShape}
            color={previewColor}
            letter={previewLetter}
            size={28}
          />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{name}</p>
            <p className="text-xs text-muted-foreground">
              Shape from {SOURCE_WORD[style.source.shape]}, letter from{" "}
              {SOURCE_WORD[style.source.letter]}, color from{" "}
              {SOURCE_WORD[style.source.color]}.
            </p>
          </div>
        </div>

        <fieldset className="space-y-1">
          <legend className="text-xs text-muted-foreground">Shape</legend>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant={draft.shape === null ? "default" : "outline"}
              className="h-8 px-2 text-xs"
              onClick={() => setDraft(d => ({ ...d, shape: null }))}
            >
              Auto
            </Button>
            {MARK_SHAPES.map(s => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={draft.shape === s ? "default" : "outline"}
                className="h-8 w-8 p-0"
                aria-label={SHAPE_NAME[s]}
                aria-pressed={draft.shape === s}
                title={SHAPE_NAME[s]}
                onClick={() => setDraft(d => ({ ...d, shape: s }))}
              >
                <Swatch shape={s} color={previewColor} size={20} />
              </Button>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            Letter — blank for automatic ({style.letter})
          </span>
          <input
            className={cn(
              "h-8 w-24 rounded-md border bg-background px-2 text-sm uppercase",
              letterOk ? "border-border" : "border-destructive"
            )}
            value={draft.letter}
            maxLength={4}
            placeholder={
              style.source.letter === "automatic" ? style.letter : ""
            }
            onFocus={selectOnFocus}
            onChange={e => setDraft(d => ({ ...d, letter: e.target.value }))}
            aria-invalid={!letterOk}
          />
          {!letterOk && (
            <span className="block text-xs text-destructive">
              Up to four letters or digits, like R, S3 or A7.
            </span>
          )}
        </label>

        <fieldset className="space-y-1">
          <legend className="text-xs text-muted-foreground">Color</legend>
          <div className="flex flex-wrap gap-1">
            <Button
              type="button"
              size="sm"
              variant={draft.color === null ? "default" : "outline"}
              className="h-8 px-2 text-xs"
              onClick={() => setDraft(d => ({ ...d, color: null }))}
            >
              Auto
            </Button>
            {MARK_COLORS.map(c => (
              <button
                key={c}
                type="button"
                className={cn(
                  "h-8 w-8 rounded-md border-2",
                  draft.color === c ? "border-foreground" : "border-transparent"
                )}
                style={{ backgroundColor: c }}
                aria-label={`Color ${c}`}
                aria-pressed={draft.color === c}
                onClick={() => setDraft(d => ({ ...d, color: c }))}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-1">
          <legend className="text-xs text-muted-foreground">Use it on</legend>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="pin-look-where"
              checked={where === "job"}
              onChange={() => setWhere("job")}
            />
            This job only
          </label>
          {"name" in everyJob ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="pin-look-where"
                checked={where === "everyJob"}
                onChange={() => setWhere("everyJob")}
              />
              <span className="min-w-0 truncate">
                Every job — {everyJob.name}
              </span>
            </label>
          ) : (
            <p className="text-xs text-muted-foreground">{everyJob.none}</p>
          )}
        </fieldset>

        {style.clashesWith.length > 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Another count on this bid shows {style.letter} too — change one so
            the pins can be told apart.
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !letterOk}
            onClick={() => {
              onSave({
                shape: draft.shape,
                letter: cleanLetter(draft.letter),
                color: draft.color,
                where,
              });
              setOpen(false);
            }}
          >
            Save
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
