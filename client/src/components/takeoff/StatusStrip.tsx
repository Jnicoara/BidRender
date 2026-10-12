/**
 * The bar above the drawing that says what the marks ARE — "30 new · 8
 * staying · 12 removed · 4 relocated" — and the open sheet's demo / new-work
 * tag (status-and-scope-plan § 1a, 1b, 2a).
 *
 * Every decision about what shows is in @/lib/statusStrip, tested there; this
 * file only draws it. Tapping a status DIMS every other mark (view only) and
 * says which sheets hold that status, with a button to each. Nothing here
 * moves a number except "Make them Remove", which is an offer with a button
 * and an Undo step.
 */
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  STATUS_VIEW_WORD,
  type MarkStatus,
  type UserMarkStatus,
} from "@shared/markStatus";
import type { StatusStripModel } from "@/lib/statusStrip";

/** The chip's colour when picked — the same family as the pin looks. */
const PICKED: Record<MarkStatus, string> = {
  new: "bg-primary text-primary-foreground border-primary",
  existing: "bg-amber-500 text-black border-amber-500",
  remove: "bg-red-600 text-white border-red-600",
  relocate: "bg-sky-600 text-white border-sky-600",
  unconfirmed: "bg-muted-foreground text-background border-muted-foreground",
};

const TOOLTIP: Record<MarkStatus, string> = {
  new: "New devices — counted and priced on the bid",
  existing: "Existing to remain — on the wall already, not priced",
  remove: "To remove — priced as remove labor",
  relocate: "To relocate — priced as relocate labor",
  unconfirmed: "Not checked yet — not counted until someone confirms them",
};

export function StatusStrip({
  model,
  focus,
  onFocus,
  sheetName,
  onOpenSheet,
  placingStatus,
  onPlacing,
  onMakeRemove,
  busy,
  canPlace,
  onFoldTwin,
  foldBusy,
  checking,
  onStartCheck,
  onAnswerCheck,
  onSkipCheck,
  onStopCheck,
  locked,
}: {
  /** "Count these as existing" for one twin count (@/hooks/useFoldTwin). */
  onFoldTwin: (groupId: number) => void;
  foldBusy: boolean;
  /** The walk through unconfirmed marks, while it is open. */
  checking: {
    position: number;
    total: number;
    label: string;
    sheet: string | null;
  } | null;
  onStartCheck: () => void;
  onAnswerCheck: (status: UserMarkStatus) => void;
  onSkipCheck: () => void;
  onStopCheck: () => void;
  /** The bid's quantities are locked: show, never offer a change. */
  locked: boolean;
  model: StatusStripModel;
  focus: MarkStatus | null;
  onFocus: (status: MarkStatus | null) => void;
  /** A sheet's short name ("E-102"), or null when it cannot be found. */
  sheetName: (sheetId: number) => string | null;
  onOpenSheet: (sheetId: number) => void;
  placingStatus: UserMarkStatus;
  onPlacing: (status: UserMarkStatus) => void;
  onMakeRemove: () => void;
  busy: boolean;
  /** A count is armed and the bid takes marks — the "both" ask applies. */
  canPlace: boolean;
}) {
  if (!model.visible) return null;
  return (
    <div
      className="border-b border-border bg-card px-3 py-1 shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs"
      data-testid="status-strip"
    >
      {model.banner === "demo" && (
        <span
          className="rounded bg-amber-500/90 px-2 py-0.5 font-semibold text-black"
          title="Tagged in the sheet's menu. Marks placed here start as Remove; each can still be set to anything."
        >
          DEMO SHEET — marks placed here start as Remove
        </span>
      )}
      {model.banner === "new" && (
        <span
          className="rounded bg-sky-600 px-2 py-0.5 font-semibold text-white"
          title="Tagged in the sheet's menu. Marks placed here start as New."
        >
          NEW WORK
        </span>
      )}
      {model.banner === "both" && (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span
            className="rounded px-2 py-0.5 font-semibold text-black"
            style={{
              background:
                "linear-gradient(90deg, rgb(245 158 11 / 0.9) 50%, rgb(56 189 248 / 0.9) 50%)",
            }}
            title="Tagged in the sheet's menu: demolition and new work on one sheet."
          >
            DEMO + NEW WORK
          </span>
          {canPlace && (
            <span className="inline-flex items-center gap-1">
              <span className="text-muted-foreground">Placing as</span>
              {(["new", "remove"] as const).map(s => (
                <Button
                  key={s}
                  size="sm"
                  variant={placingStatus === s ? "default" : "outline"}
                  className={cn(
                    "h-7 px-2 text-xs",
                    placingStatus === s && s === "remove" && PICKED.remove
                  )}
                  aria-pressed={placingStatus === s}
                  onClick={() => onPlacing(s)}
                >
                  {s === "new" ? "New" : "Remove"}
                </Button>
              ))}
            </span>
          )}
        </span>
      )}
      {model.offerRemove !== null && (
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="text-muted-foreground">
            {model.offerRemove} placed as new here.
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            disabled={busy}
            onClick={onMakeRemove}
            title="Set this sheet's new marks to Remove — they stop pricing as new devices. Undo puts them back."
          >
            Make them Remove
          </Button>
        </span>
      )}

      {model.parts && (
        <>
          {model.banner !== null && <span className="w-px h-4 bg-border" />}
          <div
            role="group"
            aria-label="Show marks by status"
            className="inline-flex flex-wrap items-center gap-1"
          >
            <button
              type="button"
              aria-pressed={focus === null}
              onClick={() => onFocus(null)}
              className={cn(
                "h-7 rounded-md border px-2 transition-colors",
                focus === null
                  ? "border-foreground/40 bg-muted font-medium text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
              title="Show every mark"
            >
              All
            </button>
            {model.parts.map(part => (
              <button
                key={part.status}
                type="button"
                aria-pressed={focus === part.status}
                onClick={() =>
                  onFocus(focus === part.status ? null : part.status)
                }
                className={cn(
                  "h-7 rounded-md border px-2 tabular-nums transition-colors",
                  focus === part.status
                    ? PICKED[part.status]
                    : "border-border text-foreground hover:bg-muted"
                )}
                title={`${TOOLTIP[part.status]}. Tap to show only these; the rest dim. Changes nothing on the bid.`}
              >
                {part.count} {part.word}
              </button>
            ))}
          </div>
        </>
      )}

      {focus !== null && model.here !== null && (
        <span className="inline-flex flex-wrap items-center gap-1 text-muted-foreground">
          <span>
            {model.here === 0
              ? `None ${STATUS_VIEW_WORD[focus]} on this sheet`
              : `${model.here} on this sheet`}
            {model.elsewhere.length > 0 ? " · also on" : ""}
          </span>
          {model.elsewhere.slice(0, 4).map(({ sheetId, count }) => (
            <Button
              key={sheetId}
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs tabular-nums"
              onClick={() => onOpenSheet(sheetId)}
              title="Open that sheet"
            >
              {sheetName(sheetId) ?? "another sheet"} · {count}
            </Button>
          ))}
          {model.elsewhere.length > 4 && (
            <span>+{model.elsewhere.length - 4} more sheets</span>
          )}
        </span>
      )}

      {/* "Check them" — the fix-it for "N unconfirmed" (plan § 1c). */}
      {model.offerCheck !== null && checking === null && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-2 text-xs"
          onClick={onStartCheck}
          title="Step through the unconfirmed marks one at a time and say what each one is. Unconfirmed marks are not counted until checked."
        >
          Check them
        </Button>
      )}

      {/*
        TWIN COUNTS still counting existing-to-remain devices as NEW (plan
        § 1c). One row each, its own fix beside it — the same fold and Undo
        as the bid screen (@/hooks/useFoldTwin). The button names the count
        the marks go to, and wraps rather than truncating (b-twin-fold found
        two truncated buttons that looked the same).
      */}
      {model.twins.map(twin => (
        <span
          key={twin.groupId}
          className="basis-full inline-flex flex-wrap items-center gap-1.5"
          data-testid="twin-warning"
        >
          <span className="text-amber-600 dark:text-amber-400">
            “{twin.label}”: {twin.newMarks}{" "}
            {twin.newMarks === 1 ? "mark counts" : "marks count"} as NEW devices
            {twin.fixable ? "." : " — the bid is locked; unlock it to fix."}
          </span>
          {twin.fixable && (
            <Button
              size="sm"
              variant="outline"
              className="h-auto min-h-7 whitespace-normal px-2 py-0.5 text-left text-xs"
              disabled={foldBusy}
              onClick={() => onFoldTwin(twin.groupId)}
              title="Move these marks onto their own count as existing to remain — they stop counting as new devices."
            >
              Count these as existing on {twin.baseLabel}
            </Button>
          )}
        </span>
      ))}

      {/*
        THE WALK — one unconfirmed mark at a time, centred and selected on the
        drawing, answered right here. Each answer goes through "Mark as…"'s
        own call, so it is an Undo step with Undo in its toast. On a locked bid
        it is a look only: no answers, the way through is unlocking.
      */}
      {checking !== null && (
        <span
          className="basis-full inline-flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1"
          data-testid="check-walk"
        >
          <span className="font-medium tabular-nums">
            Checking {checking.position} of {checking.total}
          </span>
          <span className="text-muted-foreground">
            {checking.label}
            {checking.sheet ? ` on ${checking.sheet}` : ""}
          </span>
          {locked ? (
            <span className="text-muted-foreground">
              — the bid is locked; unlock it to change marks.
            </span>
          ) : (
            (["new", "existing", "remove", "relocate"] as const).map(s => (
              <Button
                key={s}
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={busy}
                onClick={() => onAnswerCheck(s)}
                title={TOOLTIP[s]}
              >
                {s === "new"
                  ? "New"
                  : s === "existing"
                    ? "Staying"
                    : s === "remove"
                      ? "Remove"
                      : "Relocate"}
              </Button>
            ))
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onSkipCheck}
            title="Leave this one unconfirmed for now and go to the next"
          >
            {locked ? "Next" : "Skip"}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onStopCheck}
          >
            Done
          </Button>
        </span>
      )}
    </div>
  );
}
