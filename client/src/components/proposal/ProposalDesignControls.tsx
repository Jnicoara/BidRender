/**
 * How the proposal looks: layout, accent colour, and which sections appear.
 *
 * ── One component, two homes ─────────────────────────────────────────────────
 * Rendered both in Settings (where a contractor sets this up once) and in the
 * proposal composer beside the live preview (where they can actually see what
 * each choice does). Two copies of these controls would drift, and the version
 * next to the preview is the one people would really use — so there is one, and
 * it saves to the same place from either screen.
 *
 * ── Company-wide, and it says so ─────────────────────────────────────────────
 * These are company defaults: changing the layout changes every proposal this
 * account generates from now on. What it deliberately does NOT get is
 * `CompanyDefaultNotice`, the yellow-triangle warning on the pricing defaults.
 * That warning exists because a pricing change silently re-prices finished
 * bids — real money, invisibly. Nothing here can move a number. Spending the
 * same alarm on a choice of typeface is how people learn to read past it in the
 * one place it matters (CLAUDE.md § Company defaults vs per-bid overrides). So
 * the reach is stated in plain text instead, once, at the top.
 *
 * ── Choice without a template editor ─────────────────────────────────────────
 * Three finished layouts, a colour, and a list of switches. No upload, no
 * free-form editor: the app can promise a presentable document precisely
 * because it renders all of them itself, and a broken proposal goes out under
 * the contractor's name rather than ours.
 */
import { useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Check, Lock } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { selectOnFocus } from "@/lib/selectOnFocus";
import {
  DEFAULT_ACCENT,
  isValidAccent,
  PROPOSAL_LAYOUTS,
  PROPOSAL_LAYOUT_INFO,
  PROPOSAL_SECTIONS,
  isSectionVisible,
  setSectionVisible,
  type ProposalLayout,
  type ProposalSectionId,
} from "@shared/proposal";

/**
 * A handful of accents that look right in print.
 *
 * Not a restriction — the hex field beside them takes anything valid. They are
 * here because "pick a colour" with no starting point is how a proposal ends up
 * in a colour that vibrates on paper, and because most people want a sober blue
 * or green and would rather click once than know a hex code.
 */
const ACCENT_PRESETS = [
  { label: "BidRidge yellow", value: DEFAULT_ACCENT },
  { label: "Slate blue", value: "#1F4E79" },
  { label: "Forest", value: "#1E5B3A" },
  { label: "Brick", value: "#9A3412" },
  { label: "Graphite", value: "#374151" },
];

/** A miniature of each layout — the choice is visual, so the control is too. */
function LayoutThumb({
  layout,
  accent,
}: {
  layout: ProposalLayout;
  accent: string;
}) {
  const bar = <div className="h-1 rounded-sm" style={{ background: accent }} />;
  const line = (w: string, dark = false) => (
    <div
      className={cn(
        "h-1 rounded-sm",
        dark ? "bg-neutral-700" : "bg-neutral-300"
      )}
      style={{ width: w }}
    />
  );

  return (
    <div className="w-full aspect-[8.5/11] bg-white rounded-sm overflow-hidden p-2 flex flex-col gap-1.5 shadow-inner">
      {layout === "modern" && bar}
      <div className="flex items-start justify-between gap-2">
        <div className="space-y-1">
          <div
            className="w-8 h-4 rounded-sm"
            style={{
              background: layout === "minimal" ? "#e5e5e5" : accent,
              opacity: layout === "minimal" ? 1 : 0.85,
            }}
          />
          {line("2.2rem", true)}
        </div>
        <div className="space-y-1 items-end flex flex-col">
          {line("1.4rem")}
          {line("1.1rem")}
        </div>
      </div>
      <div
        className="h-px w-full"
        style={{
          background: layout === "minimal" ? "#e5e5e5" : accent,
        }}
      />
      <div className="space-y-1 pt-0.5">
        {line("1.6rem", layout === "classic")}
        {line("100%")}
        {line("85%")}
      </div>
      <div className="mt-auto">
        <div
          className={cn(
            "rounded-sm px-1 py-1 flex items-center justify-between",
            layout === "classic" && "border",
            layout === "minimal" && "border-t"
          )}
          style={{
            background: layout === "modern" ? `${accent}30` : "transparent",
            borderColor: layout === "classic" ? accent : "#404040",
          }}
        >
          {line("1.2rem", true)}
          {line("0.9rem", true)}
        </div>
      </div>
    </div>
  );
}

export function ProposalDesignControls({
  compact = false,
}: {
  /** In the composer sidebar the intro paragraph is redundant — the preview is right there. */
  compact?: boolean;
}) {
  const utils = trpc.useUtils();
  const { data: settings } = trpc.proposals.settings.useQuery();

  const save = trpc.proposals.setSettings.useMutation({
    onError: e => toast.error(e.message),
    onSettled: () => {
      void utils.proposals.settings.invalidate();
      // The document is built server-side, so a layout change is a refetch.
      void utils.proposals.document.invalidate();
    },
  });

  const [accentDraft, setAccentDraft] = useState(DEFAULT_ACCENT);
  const [termsDraft, setTermsDraft] = useState("");
  const [validDraft, setValidDraft] = useState("30");
  const editingTerms = useRef(false);

  useEffect(() => {
    if (!settings) return;
    setAccentDraft(settings.accentColor);
    setValidDraft(String(settings.validDays));
    if (!editingTerms.current) setTermsDraft(settings.termsText);
  }, [settings]);

  if (!settings) return null;

  const hidden = settings.hiddenSections;

  const commitAccent = (value: string) => {
    const next = value.trim();
    if (next === settings.accentColor) return;
    if (!isValidAccent(next)) {
      // Reverts rather than errors — an inline field has nowhere to put a
      // message, and a bad draft left on screen reads as saved.
      setAccentDraft(settings.accentColor);
      toast.error("Use a hex colour like #1F4E79.");
      return;
    }
    save.mutate({ accentColor: next });
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Proposal document
        </h3>
        {!compact && (
          <p className="text-xs text-muted-foreground mt-1">
            How every proposal you generate is laid out. These are company-wide
            — they change the look of new documents, never the price of a bid.
          </p>
        )}
      </div>

      {/* ── Layout ─────────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <Label className="text-sm">Layout</Label>
        <div className="grid grid-cols-3 gap-3">
          {PROPOSAL_LAYOUTS.map(layout => {
            const active = settings.layout === layout;
            return (
              <button
                key={layout}
                onClick={() => save.mutate({ layout })}
                aria-pressed={active}
                className={cn(
                  "relative rounded-lg border-2 p-2 text-left transition-all duration-150",
                  active
                    ? "border-[#F5C518] bg-[var(--bp-yellow-dim)]"
                    : "border-border hover:border-foreground/30"
                )}
              >
                <LayoutThumb layout={layout} accent={settings.accentColor} />
                <div className="mt-2 flex items-center gap-1">
                  <span className="text-xs font-semibold">
                    {PROPOSAL_LAYOUT_INFO[layout].label}
                  </span>
                  {active && <Check className="w-3 h-3 text-[#F5C518]" />}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {PROPOSAL_LAYOUT_INFO[settings.layout].description}
        </p>
      </div>

      {/* ── Accent colour ──────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <Label className="text-sm">Accent colour</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Rules, headings and the total panel. Everything else stays black on
            white so it photocopies and faxes cleanly.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ACCENT_PRESETS.map(preset => (
            <button
              key={preset.value}
              title={preset.label}
              aria-label={preset.label}
              aria-pressed={settings.accentColor === preset.value}
              onClick={() => save.mutate({ accentColor: preset.value })}
              className={cn(
                "w-7 h-7 rounded-full border-2 transition-transform hover:scale-105",
                settings.accentColor === preset.value
                  ? "border-foreground"
                  : "border-transparent"
              )}
              style={{ background: preset.value }}
            />
          ))}
          <Input
            value={accentDraft}
            onChange={e => setAccentDraft(e.target.value)}
            onFocus={selectOnFocus}
            onBlur={() => commitAccent(accentDraft)}
            onKeyDown={e => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setAccentDraft(settings.accentColor);
                e.currentTarget.blur();
              }
            }}
            aria-label="Accent colour hex value"
            className="h-8 w-28 text-sm font-mono"
          />
        </div>
      </div>

      {/* ── Sections ───────────────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <Label className="text-sm">Sections</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            What appears on the document. A section with nothing to show is left
            out on its own — no empty headings.
          </p>
        </div>

        <div className="space-y-2.5">
          {PROPOSAL_SECTIONS.map(section => {
            const on = isSectionVisible(hidden, section.id);
            return (
              <div
                key={section.id}
                className="flex items-start justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm">{section.label}</span>
                    {section.required && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                        title="Always on — a proposal with no sender or no price is not a proposal."
                      >
                        <Lock className="w-3 h-3" aria-hidden />
                        Always on
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {section.description}
                  </p>
                </div>
                <Switch
                  checked={on}
                  disabled={!!section.required}
                  onCheckedChange={next =>
                    save.mutate({
                      hiddenSections: setSectionVisible(
                        hidden,
                        section.id as ProposalSectionId,
                        next
                      ) as ProposalSectionId[],
                    })
                  }
                  aria-label={`Show ${section.label}`}
                  className="shrink-0 mt-0.5"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Terms & validity ───────────────────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div>
          <Label className="text-sm">Standard terms</Label>
          <p className="text-xs text-muted-foreground mt-0.5">
            Your payment terms and exclusions, reused on every proposal. Leave
            it empty and the Terms section is left off.
          </p>
        </div>
        <textarea
          value={termsDraft}
          rows={4}
          onChange={e => setTermsDraft(e.target.value)}
          onFocus={() => {
            editingTerms.current = true;
          }}
          onBlur={() => {
            editingTerms.current = false;
            if (termsDraft !== settings.termsText)
              save.mutate({ termsText: termsDraft });
          }}
          onKeyDown={e => {
            if (e.key === "Escape") {
              setTermsDraft(settings.termsText);
              editingTerms.current = false;
              e.currentTarget.blur();
            }
          }}
          placeholder={
            "50% deposit on acceptance, balance on completion.\nPrice excludes permits, patching and painting."
          }
          aria-label="Standard terms"
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] resize-none"
        />

        <div className="flex items-center gap-2">
          <Label className="text-sm shrink-0">Price good for</Label>
          <Input
            value={validDraft}
            onChange={e => setValidDraft(e.target.value)}
            onFocus={selectOnFocus}
            onBlur={() => {
              const days = Number(validDraft);
              if (!Number.isFinite(days) || days < 0 || days > 365) {
                setValidDraft(String(settings.validDays));
                return;
              }
              if (Math.trunc(days) !== settings.validDays)
                save.mutate({ validDays: Math.trunc(days) });
            }}
            onKeyDown={e => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                setValidDraft(String(settings.validDays));
                e.currentTarget.blur();
              }
            }}
            inputMode="numeric"
            aria-label="Days the quoted price stands"
            className="h-8 w-20 text-sm text-right"
          />
          <span className="text-xs text-muted-foreground">
            days {settings.validDays === 0 && "— not stated on the document"}
          </span>
        </div>
      </div>
    </section>
  );
}
