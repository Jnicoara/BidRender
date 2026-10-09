/**
 * RunSpecEditor — what a FINISHED run is made of, changed after the fact.
 *
 * For the run traced before anybody said, or traced under the wrong thing:
 * open it in the panel, pick the conduit, the wire and how many — with the same
 * material pickers the trace-time type editor uses, searching the catalog
 * shelf rather than only the types already saved.
 *
 * Saving points this run at the type that says exactly that — found in the
 * palette or made there — and puts the wire count on its circuit. The reasons
 * are in shared/runRespecify.ts; the short version is D3: a run carries where
 * and how long, its type carries what it is made of, and the bid reads types.
 *
 * ── Closed until asked ───────────────────────────────────────────────────────
 * One line saying what the run is made of, and an Edit beside it. Three pickers
 * on every open run is the "form on every run" D3 rejected; one line that
 * becomes a form when somebody wants one is not.
 *
 * ── A draft form, so rules 2–4 belong to its buttons ────────────────────────
 * Nothing saves per keystroke. The count is `CountField`, blank when unset, for
 * the same reason it is in the type editor: a zero there is a claim.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CABLE_SHELF,
  CONDUIT_SHELF,
  CountField,
  MaterialSlot,
  type PickableRunType,
} from "@/components/takeoff/RunTypePicker";

export type RunSpecPatch = {
  racewayMaterialId: number | null;
  conductorMaterialId: number | null;
  conductorCount: number | null;
  /** "No wire (empty pipe)": the wire fields are null with it. */
  emptyPipe: boolean;
  /** Only when the editor showed the ground; omitted keeps the type's. */
  groundMaterialId?: number | null;
};

type Draft = {
  racewayMaterialId: number | null;
  racewayMaterialName: string | null;
  conductorMaterialId: number | null;
  conductorMaterialName: string | null;
  conductorCount: number | null;
  groundMaterialId: number | null;
  groundMaterialName: string | null;
};

export function RunSpecEditor({
  pathType,
  current,
  circuits,
  locked,
  onSave,
  openRequested = false,
  onOpened,
}: {
  pathType: "conduit" | "cable";
  /** The run's type as the palette resolves it; undefined when it has none. */
  current: PickableRunType | undefined;
  circuits: readonly { conductorCount: number }[];
  /** The bid's quantities are locked, so this run cannot change. */
  locked: boolean;
  onSave: (patch: RunSpecPatch) => Promise<unknown>;
  /**
   * Open the form now — "Pick the wire" on the run's no-wire line, or on the
   * bid's "not on the bid yet" list (2026-10-08). `onOpened` clears the
   * request so the next press opens it again.
   */
  openRequested?: boolean;
  onOpened?: () => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  /*
    Which number "wires" means on THIS run. One circuit: its count. None: what
    the type offers, as "Add wires" would. Several: no single answer, so the
    field is not offered — each circuit row below has its own.
  */
  const several = circuits.length > 1;
  const startingCount =
    circuits.length === 1
      ? circuits[0].conductorCount
      : circuits.length === 0
        ? (current?.conductorCount ?? null)
        : null;

  const open = () =>
    setDraft({
      racewayMaterialId: current?.racewayMaterialId ?? null,
      racewayMaterialName: current?.racewayMaterialName ?? null,
      conductorMaterialId: current?.conductorMaterialId ?? null,
      conductorMaterialName: current?.conductorMaterialName ?? null,
      conductorCount: startingCount,
      groundMaterialId: current?.groundMaterialId ?? null,
      groundMaterialName: current?.groundMaterialName ?? null,
    });

  /*
    Opened from elsewhere, the form can sit below the panel's fold — seen at
    1366x768 on 2026-10-08: the jump landed on the warning and the picker was
    off screen. So a requested open brings the form into view, once.
  */
  const formRef = useRef<HTMLDivElement>(null);
  const [scrollToForm, setScrollToForm] = useState(false);

  useEffect(() => {
    if (!openRequested || locked) return;
    open();
    setScrollToForm(true);
    onOpened?.();
    // Keyed on the request only: `open` reads this render's props, which is
    // what is wanted, and re-running on every new `current` would reopen it.
  }, [openRequested, locked]);

  useEffect(() => {
    if (!scrollToForm || !draft) return;
    formRef.current?.scrollIntoView({ block: "nearest" });
    setScrollToForm(false);
  }, [scrollToForm, draft]);

  const save = async (patch: RunSpecPatch) => {
    setSaving(true);
    try {
      await onSave(patch);
      setDraft(null);
    } catch {
      // The mutation's onError has said why; the draft stays so nothing
      // typed is lost.
    } finally {
      setSaving(false);
    }
  };

  /** Zero on the type is "says no wire" (shared/runNoWire.ts). */
  const emptyPipe =
    current?.conductorCount === 0 && !current.conductorMaterialName;

  const summary =
    pathType === "cable"
      ? (current?.conductorMaterialName ?? null)
      : [
          current?.racewayMaterialName ?? null,
          /*
            What the run PULLS, from its circuits — not the type's default,
            which a run with no circuits does not have (runToBidWire.test.ts).
          */
          current?.conductorMaterialName
            ? circuits.length === 0
              ? `${current.conductorMaterialName}, none pulled yet`
              : several
                ? `${circuits.length} circuits of ${current.conductorMaterialName}`
                : `${circuits[0].conductorCount} × ${current.conductorMaterialName}`
            : emptyPipe
              ? "empty pipe"
              : null,
        ]
          .filter(Boolean)
          .join(" · ") || null;

  if (!draft) {
    return (
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-xs text-muted-foreground shrink-0">Made of</span>
        <span className="text-xs flex-1 min-w-0 truncate">
          {summary ?? (
            <span className="text-muted-foreground">nothing said yet</span>
          )}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-6 gap-1 px-2 text-xs shrink-0"
          onClick={open}
          disabled={locked}
          title={
            locked
              ? "This bid's quantities are locked, so its runs cannot be changed"
              : pathType === "cable"
                ? "Set or change the cable"
                : "Set or change the conduit, the wire and how many"
          }
          aria-label="Edit what this run is made of"
        >
          {locked ? (
            <Lock className="w-3 h-3" />
          ) : (
            <Pencil className="w-3 h-3" />
          )}
          Edit
        </Button>
      </div>
    );
  }

  /** The type names no ground, and a wire is being picked: ask for it. */
  const showGround =
    pathType === "conduit" &&
    !current?.groundMaterialName &&
    draft.conductorMaterialId !== null;

  return (
    <div
      ref={formRef}
      className="mt-1.5 rounded-md border border-border/70 p-2"
    >
      <p className="text-xs font-medium">What is this run made of?</p>

      {pathType === "conduit" && (
        <MaterialSlot
          title="Conduit — type and size"
          hint="Search conduit — “3/4 emt”, “2 inch pvc”…"
          name={draft.racewayMaterialName}
          categories={CONDUIT_SHELF}
          onPick={m =>
            setDraft({
              ...draft,
              racewayMaterialId: m.id,
              racewayMaterialName: m.name,
            })
          }
          onClear={() =>
            setDraft({
              ...draft,
              racewayMaterialId: null,
              racewayMaterialName: null,
            })
          }
        />
      )}

      <MaterialSlot
        title={pathType === "cable" ? "Cable" : "Wire — type and size"}
        hint={
          pathType === "cable"
            ? "Search cable — “12-2 mc”, “romex”…"
            : "Search wire — “#12 thhn”, “#10 stranded”…"
        }
        name={draft.conductorMaterialName}
        categories={CABLE_SHELF}
        onPick={m =>
          setDraft({
            ...draft,
            conductorMaterialId: m.id,
            conductorMaterialName: m.name,
          })
        }
        onClear={() =>
          setDraft({
            ...draft,
            conductorMaterialId: null,
            conductorMaterialName: null,
          })
        }
      />

      {pathType === "conduit" && (
        <div className="mt-2.5">
          <p className="text-xs font-medium">Number of wires</p>
          {several ? (
            <p className="text-xs text-muted-foreground mt-1">
              This run has {circuits.length} circuits — set the wires on each
              one below.
            </p>
          ) : (
            <div className="flex items-center gap-2 mt-1">
              <CountField
                value={draft.conductorCount}
                max={60}
                onChange={conductorCount =>
                  setDraft({ ...draft, conductorCount })
                }
                ariaLabel="Number of wires"
              />
              <span className="text-xs text-muted-foreground">
                insulated, not counting the ground
              </span>
            </div>
          )}
        </div>
      )}

      {/*
        THE GROUND, only where the type names none and a wire is being picked
        (2026-10-08). Picking the wire for an underground run used to leave a
        ground counted on its circuit with nothing named to buy — "can't go on
        the bid as it stands", with no way to name it from here. Everywhere
        else the ground rides along unseen (rule 7), as before.
      */}
      {showGround && (
        <MaterialSlot
          title="Ground — type and size"
          hint="Search ground wire — “#10 bare”, “#8 green”…"
          name={draft.groundMaterialName}
          categories={CABLE_SHELF}
          onPick={m =>
            setDraft({
              ...draft,
              groundMaterialId: m.id,
              groundMaterialName: m.name,
            })
          }
          onClear={() =>
            setDraft({
              ...draft,
              groundMaterialId: null,
              groundMaterialName: null,
            })
          }
        />
      )}

      <div className="flex items-center gap-1.5 mt-3">
        <Button
          size="sm"
          className="h-7 flex-1 gap-1.5 text-xs"
          disabled={saving || locked}
          onClick={() =>
            void save({
              racewayMaterialId:
                pathType === "cable" ? null : draft.racewayMaterialId,
              conductorMaterialId: draft.conductorMaterialId,
              conductorCount:
                pathType === "cable" || several ? null : draft.conductorCount,
              emptyPipe: false,
              // Sent only when shown — omitted keeps the type's (rule 7).
              ...(showGround
                ? { groundMaterialId: draft.groundMaterialId }
                : {}),
            })
          }
        >
          <Check className="w-3 h-3" /> {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() => setDraft(null)}
        >
          Cancel
        </Button>
      </div>
      {/*
        The other answer to "which wire" (2026-10-08): none — a spare, a
        sleeve, a trench for a future pull. Its own button rather than a blank
        wire field, because a blank wire is "not said", which is the question
        this answers. Not on a run whose circuits already carry wire: the
        server refuses that and says so.
      */}
      {pathType === "conduit" && circuits.length === 0 && !emptyPipe && (
        <button
          type="button"
          className="mt-2 text-xs underline text-muted-foreground hover:text-foreground disabled:opacity-50"
          disabled={saving || locked}
          onClick={() =>
            void save({
              racewayMaterialId: draft.racewayMaterialId,
              conductorMaterialId: null,
              conductorCount: null,
              emptyPipe: true,
            })
          }
        >
          No wire (empty pipe)
        </button>
      )}
    </div>
  );
}
