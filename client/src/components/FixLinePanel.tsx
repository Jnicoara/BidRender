/**
 * "FIX THIS LINE" — the panel that opens ON an assembly or run line from any
 * of its warnings ("Not priced", "+ 1 part not priced", "+ hours not set",
 * "+ material not priced", hours with no rate), so the person fixes it right
 * there instead of leaving the bid (references/never-stuck-plan.md, gap 11,
 * as amended by the owner 2026-10-07).
 *
 * Save puts the typed numbers on THIS line. "Also save to my library", ticked
 * by default, puts them on the library row too, so the next bid is not stuck
 * on the same missing number. Nothing else moves; other lines on this bid
 * are offered afterwards, never changed on their own.
 *
 * A locked bid keeps its line: the panel says why, and the library half still
 * works (`lineFixRefusal`). A Won or Lost bid asks "Change anyway?" with
 * Continue and Cancel before Save goes out (`lineFixClosedWarning`; owner,
 * 2026-10-08). Both in shared/lineFix.ts.
 *
 * The rules are in @shared/lineFix and @/lib/fixLineDraft, where the suite can
 * reach them; this file only draws them.
 *
 * Editing rules (CLAUDE.md § Editing fields): numbers select on focus; Enter
 * saves AND closes; Escape abandons AND closes. A form with its own Save, so
 * blank boxes stay blank — `InlineNumberField` would save as you type.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MaterialPicker } from "@/components/MaterialPicker";
import { money } from "@/lib/money";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  EMPTY_FIX_DRAFT,
  fixLineRequest,
  forOtherLine,
  type FixDraft,
  type FixLineRequest,
} from "@/lib/fixLineDraft";
import { LIBRARY_NOTE, otherLinesOffer } from "@shared/lineFix";

const UNIT_WORD: Record<string, string> = {
  each: "each",
  foot: "per ft",
  box: "per box",
};

function NumberBox({
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus,
  className = "w-24",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  ariaLabel: string;
  autoFocus?: boolean;
  className?: string;
}) {
  return (
    <Input
      inputMode="decimal"
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={selectOnFocus}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      className={`h-8 text-sm ${className}`}
    />
  );
}

export function FixLinePanel({
  bidId,
  line,
  onChanged,
  onClose,
}: {
  bidId: number;
  line: { id: number; name: string; snapshotLaborRate: string | null };
  /** The bid screen's one invalidation helper. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const options = trpc.bids.fixLineOptions.useQuery(
    { bidId, lineId: line.id },
    { refetchOnMount: "always", staleTime: 0 }
  );
  const { data: rates = [] } = trpc.laborRates.list.useQuery();
  const [draft, setDraft] = useState<FixDraft>(EMPTY_FIX_DRAFT);
  const [error, setError] = useState<string | null>(null);
  /** After a save, the same fix for other lines on this bid — only offered. */
  const [offer, setOffer] = useState<{
    request: FixLineRequest;
    lineIds: number[];
  } | null>(null);
  /** Won or Lost: the save waiting on "Change anyway?". */
  const [asking, setAsking] = useState<FixLineRequest | null>(null);

  const fix = trpc.bids.fixLine.useMutation();
  const set = (patch: Partial<FixDraft>) => {
    setError(null);
    setDraft(d => ({ ...d, ...patch }));
  };

  const afterLibraryWrite = (saved: string[]) => {
    if (saved.length === 0) return;
    void utils.materials.invalidate();
    void utils.assemblies.invalidate();
  };

  const save = async () => {
    const data = options.data;
    if (!data) return;
    const built = fixLineRequest(draft, {
      bidId,
      lineId: line.id,
      gaps: data.gaps,
    });
    if (!built.ok) {
      setError(built.message);
      return;
    }
    // Won or Lost: ask first. The server refuses without the answer too.
    if (data.closedWarning) {
      setAsking(built.request);
      return;
    }
    await send(built.request);
  };

  const send = async (request: FixLineRequest) => {
    try {
      const result = await fix.mutateAsync(request);
      afterLibraryWrite(result.savedToLibrary);
      onChanged();
      if (!result.lineChanged) {
        toast.success("Saved to your library. This bid's line is unchanged.");
        onClose();
        return;
      }
      toast.success(
        result.savedToLibrary.length > 0
          ? "Line fixed, and saved to your library."
          : "Line fixed."
      );
      if (result.otherLineIds.length > 0) {
        setOffer({ request, lineIds: result.otherLineIds });
      } else {
        onClose();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't save.");
    }
  };

  const updateOthers = async (request: FixLineRequest, lineIds: number[]) => {
    let done = 0;
    const failed: string[] = [];
    for (const id of lineIds) {
      try {
        await fix.mutateAsync(forOtherLine(request, id));
        done += 1;
      } catch (e) {
        failed.push(e instanceof Error ? e.message : "did not save");
      }
    }
    onChanged();
    if (failed.length === 0)
      toast.success(`${done} other line${done === 1 ? "" : "s"} updated.`);
    else toast.error(`${done} updated, ${failed.length} not: ${failed[0]}`);
    onClose();
  };

  const data = options.data;
  const shell =
    "mt-2 rounded-md border border-[#F5C518]/40 bg-[#F5C518]/5 p-3 space-y-3 text-xs";

  if (offer) {
    return (
      <div className={shell} role="group" aria-label={`Fix ${line.name}`}>
        <p className="text-foreground">
          {otherLinesOffer(offer.lineIds.length)}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-8"
            disabled={fix.isPending}
            onClick={() => void updateOthers(offer.request, offer.lineIds)}
          >
            {fix.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : null}
            Update {offer.lineIds.length === 1 ? "it" : "them"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            autoFocus
            onClick={onClose}
          >
            Not now
          </Button>
        </div>
      </div>
    );
  }

  if (asking && data?.closedWarning) {
    // Owner, 2026-10-08: a Won or Lost bid may already be with the customer,
    // so its line changes only on Continue. Cancel goes back to the form with
    // what was typed, and nothing is saved. Focus starts on Cancel: Enter
    // twice must not change a sent price.
    return (
      <div
        className={shell}
        role="alertdialog"
        aria-label={`Fix ${line.name}`}
        onKeyDown={e => {
          if (e.key === "Escape") {
            e.preventDefault();
            setAsking(null);
          }
        }}
      >
        <p className="text-foreground">{data.closedWarning}</p>
        {error ? (
          <p role="alert" className="text-red-500">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            className="h-8"
            disabled={fix.isPending}
            onClick={() => {
              const request = { ...asking, changeClosedBid: true };
              void send(request).then(() => setAsking(null));
            }}
          >
            {fix.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
            ) : null}
            Continue
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8"
            autoFocus
            disabled={fix.isPending}
            onClick={() => {
              setError(null);
              setAsking(null);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    // A first load of a few rows: a quiet line, not a spinner.
    return (
      <div className={shell}>
        <span className="text-muted-foreground">
          {options.error ? options.error.message : "Reading this line…"}
        </span>
      </div>
    );
  }

  const { gaps } = data;
  const showRate =
    gaps.rate || (gaps.hours && !(Number(line.snapshotLaborRate ?? 0) > 0));
  const overhead = data.assembly?.overheadHours ?? 0;
  const typedHours = Number(draft.hours);
  let focusGiven = false;
  const focusFirst = () => {
    if (focusGiven) return false;
    focusGiven = true;
    return true;
  };

  return (
    <form
      className={shell}
      aria-label={`Fix ${line.name}`}
      // Escape abandons and closes, wherever focus is inside the panel —
      // except in the material search, whose own Escape clears its query.
      onKeyDown={e => {
        if (e.key === "Escape" && !e.defaultPrevented) {
          e.preventDefault();
          onClose();
        }
      }}
      onSubmit={e => {
        e.preventDefault();
        void save();
      }}
    >
      {data.refusal ? <p className="text-foreground">{data.refusal}</p> : null}

      {gaps.parts ? (
        <div className="space-y-1.5">
          <div className="font-medium text-foreground">Parts not priced</div>
          {data.parts.map(part => (
            <div
              key={part.materialId}
              className="flex flex-wrap items-center gap-x-2 gap-y-1"
            >
              <span className="min-w-0 flex-1 basis-40 text-foreground break-words">
                {part.name}
                <span className="text-muted-foreground">
                  {" "}
                  · {part.qtyPerOne} on one
                </span>
              </span>
              <NumberBox
                value={draft.partPrices[part.materialId] ?? ""}
                onChange={text =>
                  set({
                    partPrices: {
                      ...draft.partPrices,
                      [part.materialId]: text,
                    },
                  })
                }
                placeholder={`$ ${UNIT_WORD[part.unitOfSale] ?? "each"}`}
                ariaLabel={`Price of ${part.name}, ${UNIT_WORD[part.unitOfSale] ?? "each"}`}
                autoFocus={focusFirst()}
              />
              {part.libraryPrice > 0 ? (
                <button
                  type="button"
                  className="text-muted-foreground underline underline-offset-2"
                  onClick={() =>
                    set({
                      partPrices: {
                        ...draft.partPrices,
                        [part.materialId]: String(part.libraryPrice),
                      },
                    })
                  }
                >
                  use library {money(part.libraryPrice)}
                </button>
              ) : null}
            </div>
          ))}
          {data.partsNote ? (
            <p className="text-muted-foreground">{data.partsNote}</p>
          ) : null}
        </div>
      ) : null}

      {gaps.material ? (
        <div className="space-y-1.5">
          <div className="font-medium text-foreground">
            No material on this line
          </div>
          {draft.material ? (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="min-w-0 flex-1 basis-40 text-foreground break-words">
                {draft.material.name}{" "}
                <button
                  type="button"
                  className="text-muted-foreground underline underline-offset-2"
                  onClick={() => set({ material: null })}
                >
                  change
                </button>
              </span>
              <NumberBox
                value={draft.materialQty}
                onChange={text => set({ materialQty: text })}
                placeholder="how many"
                ariaLabel={`How many ${draft.material.name} on one`}
                autoFocus
                className="w-20"
              />
              <NumberBox
                value={draft.materialPrice}
                onChange={text => set({ materialPrice: text })}
                placeholder={
                  draft.material.libraryPrice > 0
                    ? money(draft.material.libraryPrice)
                    : "$ price"
                }
                ariaLabel={`Price of ${draft.material.name}`}
              />
              <span className="basis-full text-muted-foreground">
                {draft.material.libraryPrice > 0
                  ? `Priced at its library ${money(draft.material.libraryPrice)} unless you type one.`
                  : "It has no price yet — type one."}
              </span>
            </div>
          ) : (
            <MaterialPicker
              compact
              autoFocus={focusFirst()}
              onChoose={m =>
                set({
                  material: {
                    id: m.id,
                    name: m.name,
                    libraryPrice: Number(m.costPerUnit) || 0,
                  },
                })
              }
            />
          )}
          <p className="text-muted-foreground">
            None on purpose? Tick &ldquo;Labor only&rdquo; on the assembly in
            your Library.
          </p>
        </div>
      ) : null}

      {gaps.runPrice && data.run ? (
        <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 flex-1 basis-40 text-foreground">
            {data.run.name} — price {UNIT_WORD[data.run.unitOfSale] ?? "each"}
          </span>
          <NumberBox
            value={draft.runPrice}
            onChange={text => set({ runPrice: text })}
            placeholder="$ price"
            ariaLabel={`Price of ${data.run.name}`}
            autoFocus={focusFirst()}
          />
          {data.run.libraryPrice > 0 ? (
            <button
              type="button"
              className="text-muted-foreground underline underline-offset-2"
              onClick={() => set({ runPrice: String(data.run!.libraryPrice) })}
            >
              use library {money(data.run.libraryPrice)}
            </button>
          ) : null}
        </label>
      ) : null}

      {gaps.hours || gaps.runHours ? (
        <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 flex-1 basis-40 text-foreground">
            {gaps.runHours
              ? data.run?.hoursAreBend
                ? "Labor hours per bend"
                : `Labor hours ${UNIT_WORD[data.run?.unitOfSale ?? "each"] ?? "each"}`
              : "Labor hours for one"}
          </span>
          <NumberBox
            value={draft.hours}
            onChange={text => set({ hours: text })}
            placeholder="hours"
            ariaLabel={`Labor hours for ${line.name}`}
            autoFocus={focusFirst()}
            className="w-20"
          />
          {gaps.hours && overhead > 0 ? (
            <span className="basis-full text-muted-foreground">
              + {overhead} h overhead from the assembly
              {draft.hours.trim() !== "" && Number.isFinite(typedHours)
                ? ` = ${Math.round((typedHours + overhead) * 1e4) / 1e4} h on this line`
                : ""}
            </span>
          ) : null}
        </label>
      ) : null}

      {showRate && data.assembly ? (
        <label className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="min-w-0 flex-1 basis-40 text-foreground">
            Who does the hours
          </span>
          <select
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
            value={draft.laborRateId ?? ""}
            aria-label={`Who does the labor on ${line.name}`}
            onChange={e => {
              const id = Number(e.target.value);
              set({ laborRateId: id > 0 ? id : null });
            }}
          >
            <option value="">pick a role</option>
            {rates.map(rate => (
              <option
                key={rate.id}
                value={rate.id}
                disabled={!(rate.effectiveHourlyRate > 0)}
              >
                {rate.name} —{" "}
                {rate.effectiveHourlyRate > 0
                  ? `${money(rate.effectiveHourlyRate)}/h`
                  : "no rate yet"}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="space-y-0.5">
        <label className="flex items-center gap-2 text-foreground">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#F5C518]"
            checked={draft.saveToLibrary}
            onChange={e => set({ saveToLibrary: e.target.checked })}
          />
          Also save to my library
        </label>
        <p className="pl-6 text-muted-foreground">
          {draft.saveToLibrary
            ? data.assembly?.isStarter
              ? `${LIBRARY_NOTE} A starter is copied into your library first; the shipped one is not changed.`
              : LIBRARY_NOTE
            : "Only this line changes."}
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-red-500">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          className="h-8"
          disabled={
            fix.isPending || (data.refusal !== null && !draft.saveToLibrary)
          }
        >
          {fix.isPending ? (
            <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
          ) : null}
          {data.refusal ? "Save to my library" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-8"
          onClick={onClose}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
