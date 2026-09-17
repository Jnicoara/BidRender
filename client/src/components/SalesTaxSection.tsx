/**
 * Sales tax settings — what is taxable, and the rates for the places you work.
 *
 * ── The disclaimer is not decoration ─────────────────────────────────────────
 * Everything on this screen is a number the contractor typed and is
 * responsible for. The app applies rates; it does not know them, and it cannot
 * tell a correct rate from a stale one. That is stated at the top of the
 * section in plain language rather than buried in a tooltip, because the whole
 * feature is only safe if the person configuring it understands that they —
 * not the software — are the authority on what their jurisdiction charges.
 *
 * See the header of @shared/salesTax for the fuller reasoning.
 *
 * ── Everything defaults to off ───────────────────────────────────────────────
 * Tax is disabled, materials are not taxable, labor is not taxable. A user who
 * never opens this screen gets bids that behave exactly as they did before the
 * feature existed.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Archive,
  ArchiveRestore,
  BadgeCheck,
  Check,
  Percent,
  Plus,
  TriangleAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { selectOnFocus } from "@/lib/selectOnFocus";
import { combinedRatePct } from "@shared/salesTax";

type ComponentDraft = { label: string; ratePct: string };

type AreaDraft = {
  name: string;
  state: string;
  county: string;
  city: string;
  sourceNote: string;
  components: ComponentDraft[];
};

const emptyArea: AreaDraft = {
  name: "",
  state: "",
  county: "",
  city: "",
  sourceNote: "",
  components: [{ label: "State", ratePct: "" }],
};

const orNull = (value: string) => value.trim() || null;

function AreaForm({
  draft,
  setDraft,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  draft: AreaDraft;
  setDraft: (draft: AreaDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const patch = (part: Partial<AreaDraft>) => setDraft({ ...draft, ...part });
  const parsed = draft.components.map(c => ({
    label: c.label.trim(),
    ratePct: Number(c.ratePct),
  }));
  const total = combinedRatePct(parsed.filter(c => Number.isFinite(c.ratePct)));
  const hasKey = Boolean(
    draft.state.trim() || draft.county.trim() || draft.city.trim()
  );
  const valid =
    draft.name.trim() !== "" &&
    hasKey &&
    parsed.length > 0 &&
    parsed.every(c => c.label !== "" && Number.isFinite(c.ratePct)) &&
    total <= 25;

  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <Input
        value={draft.name}
        onChange={e => patch({ name: e.target.value })}
        className="h-8 text-sm"
        placeholder="What to call it — e.g. Chicago, IL"
        aria-label="Tax area name"
        autoFocus
      />

      <div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Input
            value={draft.state}
            onChange={e => patch({ state: e.target.value })}
            className="h-8 text-sm"
            placeholder="State — e.g. IL"
            aria-label="State"
          />
          <Input
            value={draft.county}
            onChange={e => patch({ county: e.target.value })}
            className="h-8 text-sm"
            placeholder="County (optional)"
            aria-label="County"
          />
          <Input
            value={draft.city}
            onChange={e => patch({ city: e.target.value })}
            className="h-8 text-sm"
            placeholder="City (optional)"
            aria-label="City"
          />
        </div>
        {/* Said explicitly because the matching is text-based and people
            reasonably expect geocoding. Knowing it reads the address is what
            makes an unmatched bid understandable rather than mysterious. */}
        <p className="text-xs text-muted-foreground mt-1.5">
          A bid uses this area when its job address mentions every one of these.
          Fill in only what you need — a state on its own covers the whole
          state.
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Rate
        </div>
        {draft.components.map((component, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={component.label}
              onChange={e => {
                const next = [...draft.components];
                next[index] = { ...next[index], label: e.target.value };
                patch({ components: next });
              }}
              className="h-8 flex-1 text-sm"
              placeholder="State / County / City / District"
              aria-label={`Rate part ${index + 1} name`}
            />
            <Input
              value={component.ratePct}
              onChange={e => {
                const next = [...draft.components];
                next[index] = { ...next[index], ratePct: e.target.value };
                patch({ components: next });
              }}
              onFocus={selectOnFocus}
              inputMode="decimal"
              className="h-8 w-24 text-sm text-right"
              placeholder="6.25"
              aria-label={`Rate part ${index + 1} percent`}
            />
            <span className="text-xs text-muted-foreground w-3">%</span>
            {draft.components.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0 text-muted-foreground"
                onClick={() =>
                  patch({
                    components: draft.components.filter((_, n) => n !== index),
                  })
                }
                aria-label={`Remove rate part ${index + 1}`}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </div>
        ))}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs"
            onClick={() =>
              patch({
                components: [...draft.components, { label: "", ratePct: "" }],
              })
            }
          >
            <Plus className="w-3 h-3" /> Add a part
          </Button>
          {/* Stacked rates are the norm, so the combined figure is shown as it
              is built — it is the number a contractor recognises. */}
          <span className="ml-auto text-xs font-mono text-[#F5C518]">
            {total.toFixed(4).replace(/\.?0+$/, "")}% combined
          </span>
        </div>
        {total > 25 && (
          <p className="text-xs text-destructive">
            That is over 25%. Check the parts — a rate is entered as 7.25, not
            725.
          </p>
        )}
      </div>

      <Input
        value={draft.sourceNote}
        onChange={e => patch({ sourceNote: e.target.value })}
        className="h-8 text-sm"
        placeholder="Where this rate came from (optional) — a link, or who confirmed it"
        aria-label="Source note"
      />

      <div className="flex items-center gap-2">
        <Button
          size="sm"
          className="h-8 gap-1.5 text-xs"
          onClick={onSubmit}
          disabled={!valid}
        >
          <Check className="w-3 h-3" /> {submitLabel}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 gap-1.5 text-xs"
          onClick={onCancel}
        >
          <X className="w-3 h-3" /> Cancel
        </Button>
        {!hasKey && draft.name.trim() !== "" && (
          <span className="text-xs text-muted-foreground">
            Add a state, county or city so an address can match it.
          </span>
        )}
      </div>
    </div>
  );
}

export function SalesTaxSection() {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<AreaDraft>(emptyArea);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<AreaDraft>(emptyArea);
  const [showArchived, setShowArchived] = useState(false);

  const rules = trpc.salesTax.rules.useQuery();
  const areas = trpc.salesTax.list.useQuery();
  const archived = trpc.salesTax.archived.useQuery();

  const invalidate = () => {
    void utils.salesTax.list.invalidate();
    void utils.salesTax.archived.invalidate();
    void utils.salesTax.rules.invalidate();
  };

  const setRules = trpc.salesTax.setRules.useMutation({
    onError: e => toast.error(e.message),
    onSettled: invalidate,
  });
  const createArea = trpc.salesTax.create.useMutation({
    onSuccess: () => {
      toast.success("Tax area added.");
      setAdding(false);
      setDraft(emptyArea);
    },
    onError: e => toast.error(e.message),
    onSettled: invalidate,
  });
  const updateArea = trpc.salesTax.update.useMutation({
    onSuccess: () => setEditingId(null),
    onError: e => toast.error(e.message),
    onSettled: invalidate,
  });
  const markVerified = trpc.salesTax.markVerified.useMutation({
    onSuccess: () => toast.success("Marked as checked today."),
    onError: e => toast.error(e.message),
    onSettled: invalidate,
  });
  const archiveArea = trpc.salesTax.archive.useMutation({
    onError: e => toast.error(e.message),
    onSettled: invalidate,
  });
  const restoreArea = trpc.salesTax.restore.useMutation({
    onError: e => toast.error(e.message),
    onSettled: invalidate,
  });

  const toPayload = (d: AreaDraft) => ({
    name: d.name.trim(),
    state: orNull(d.state),
    county: orNull(d.county),
    city: orNull(d.city),
    sourceNote: orNull(d.sourceNote),
    components: d.components.map(c => ({
      label: c.label.trim(),
      ratePct: Number(c.ratePct),
    })),
  });

  const current = rules.data;
  const rows = areas.data ?? [];
  const archivedRows = archived.data ?? [];

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">Sales tax</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Off until you turn it on. When it is on, a bid takes its rate from the
          job address.
        </p>
      </div>

      {/*
        ── The disclaimer ───────────────────────────────────────────────────
        Top of the section, before any control, in the same yellow panel the
        app uses for "this reaches everything". Sales tax is the one place in
        this app where the software must be explicit that it is not the
        authority — the rates are the user's and so is the responsibility.
      */}
      <div className="rounded-lg border border-[#F5C518]/30 bg-[#F5C518]/10 p-3 text-xs text-[#F5C518] flex items-start gap-2">
        <TriangleAlert className="w-4 h-4 shrink-0 mt-px" aria-hidden />
        <div className="space-y-1">
          <div className="font-medium">
            BidRidge does not know your tax rates — you do.
          </div>
          <div className="text-[#F5C518]/85">
            Nothing here is looked up or kept up to date for you. Every rate and
            every rule below is one you entered, and rates change. Confirm them
            with your state or county, or with your accountant, before you rely
            on a bid — and check again periodically. This applies to what is
            taxable as much as to the percentage: whether labor is taxed, and
            whether tax goes on your price or your cost, varies by jurisdiction
            and by the kind of work.
          </div>
        </div>
      </div>

      {/* ── What is taxable ── */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Charge sales tax on bids</div>
            <div className="text-xs text-muted-foreground">
              With this off, no bid shows a tax line anywhere.
            </div>
          </div>
          <Switch
            checked={current?.enabled ?? false}
            onCheckedChange={enabled => setRules.mutate({ enabled })}
            aria-label="Charge sales tax on bids"
          />
        </div>

        {current?.enabled && (
          <div className="space-y-3 pt-1 border-t border-border">
            <div className="flex items-center justify-between gap-3 pt-3">
              <div className="min-w-0">
                <div className="text-sm">Materials are taxable</div>
              </div>
              <Switch
                checked={current.taxMaterials}
                onCheckedChange={taxMaterials =>
                  setRules.mutate({ taxMaterials })
                }
                aria-label="Materials are taxable"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm">Labor is taxable</div>
                <div className="text-xs text-muted-foreground">
                  Many states tax materials but not labor. Some tax both. Check
                  yours.
                </div>
              </div>
              <Switch
                checked={current.taxLabor}
                onCheckedChange={taxLabor => setRules.mutate({ taxLabor })}
                aria-label="Labor is taxable"
              />
            </div>

            <div className="space-y-1.5">
              <div className="text-sm">Apply the rate to</div>
              <Select
                value={current.applyTo}
                onValueChange={applyTo =>
                  setRules.mutate({ applyTo: applyTo as "price" | "cost" })
                }
              >
                <SelectTrigger
                  className="h-8 text-sm"
                  aria-label="Apply the rate to"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="price">
                    What I charge (after overhead and profit)
                  </SelectItem>
                  <SelectItem value="cost">
                    What I paid (before markup)
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                These give different amounts on the same bid. Which one is right
                depends on how your jurisdiction treats the work.
              </p>
            </div>

            {!current.taxMaterials && !current.taxLabor && (
              <p className="text-xs text-destructive">
                Sales tax is on but nothing is marked taxable, so every bid will
                show no tax. Switch on materials, labor, or both.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Tax areas ── */}
      {current?.enabled && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Tax areas
            </div>
            <span className="text-xs text-muted-foreground/70">
              {rows.length}
            </span>
            {!adding && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-xs ml-auto"
                onClick={() => setAdding(true)}
              >
                <Plus className="w-3 h-3" /> Add a tax area
              </Button>
            )}
          </div>

          {adding && (
            <AreaForm
              draft={draft}
              setDraft={setDraft}
              submitLabel="Add tax area"
              onCancel={() => {
                setAdding(false);
                setDraft(emptyArea);
              }}
              onSubmit={() => createArea.mutate(toPayload(draft))}
            />
          )}

          {rows.length === 0 && !adding ? (
            <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">No tax areas yet.</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                Until you add one, bids with tax switched on will say they have
                no rate rather than charging nothing.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {rows.map(row =>
                editingId === row.id ? (
                  <div
                    key={row.id}
                    className="p-4 border-b border-border last:border-0"
                  >
                    <AreaForm
                      draft={editDraft}
                      setDraft={setEditDraft}
                      submitLabel="Save"
                      onCancel={() => setEditingId(null)}
                      onSubmit={() =>
                        updateArea.mutate({
                          id: row.id,
                          ...toPayload(editDraft),
                        })
                      }
                    />
                  </div>
                ) : (
                  <div
                    key={row.id}
                    className="flex items-start gap-3 px-4 py-3 border-b border-border last:border-0"
                  >
                    <Percent className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{row.name}</span>
                        <Badge
                          variant="outline"
                          className="text-xs font-mono text-[#F5C518] border-[#F5C518]/30"
                        >
                          {row.combinedRatePct}%
                        </Badge>
                        {row.verifiedAt ? (
                          <Badge
                            variant="outline"
                            className="text-xs gap-1 text-muted-foreground"
                          >
                            <BadgeCheck className="w-3 h-3" />
                            checked{" "}
                            {new Date(row.verifiedAt).toLocaleDateString()}
                          </Badge>
                        ) : (
                          // Absence of a tick is the flag, exactly as an
                          // unpriced material is flagged by its $0.
                          <Badge
                            variant="outline"
                            className="text-xs text-[#F5C518] border-[#F5C518]/30"
                          >
                            not verified
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {[row.city, row.county, row.state]
                          .filter(Boolean)
                          .join(" · ")}
                        {row.components.length > 1 && (
                          <>
                            {" — "}
                            {row.components
                              .map(c => `${c.label} ${c.ratePct}%`)
                              .join(" + ")}
                          </>
                        )}
                      </div>
                      {row.sourceNote && (
                        <div className="text-xs text-muted-foreground/70 mt-0.5">
                          {row.sourceNote}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => markVerified.mutate({ id: row.id })}
                        title="I have checked this rate is still current"
                      >
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setEditingId(row.id);
                          setEditDraft({
                            name: row.name,
                            state: row.state ?? "",
                            county: row.county ?? "",
                            city: row.city ?? "",
                            sourceNote: row.sourceNote ?? "",
                            components: row.components.map(c => ({
                              label: c.label,
                              ratePct: String(c.ratePct),
                            })),
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => archiveArea.mutate({ id: row.id })}
                        aria-label={`Archive ${row.name}`}
                        title="Archive — bids pinned to it keep working"
                      >
                        <Archive className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              )}
            </div>
          )}

          {archivedRows.length > 0 && (
            <div>
              <button
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowArchived(v => !v)}
              >
                {showArchived ? "Hide" : "Show"} archived ({archivedRows.length}
                )
              </button>
              {showArchived && (
                <div className="mt-2 rounded-xl border border-border bg-card overflow-hidden">
                  {archivedRows.map(row => (
                    <div
                      key={row.id}
                      className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-0"
                    >
                      <span className="flex-1 min-w-0 text-sm text-muted-foreground truncate">
                        {row.name} · {row.combinedRatePct}%
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 text-xs"
                        onClick={() => restoreArea.mutate({ id: row.id })}
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" /> Restore
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
