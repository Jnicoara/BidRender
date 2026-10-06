/**
 * "FOR YOUR QUOTE APP" — the bid's price to the customer, before tax, in the
 * five buckets the owner's quote app takes, with a Copy on every figure.
 * references/quote-app-panel-plan.md; the figures come from
 * shared/quoteAppExport.ts and are tested there (server/quoteAppPanel.test.ts).
 *
 * ── Made for a phone ─────────────────────────────────────────────────────────
 * The quote app is filled in field by field on a phone, so this is a full-
 * height sheet at phone width (`h-dvh`, one scroll region) and a dialog on a
 * desktop. Copy puts `1050.00` on the clipboard — no `$`, no comma — because
 * that is what pastes into a numeric field.
 *
 * ── Never yesterday's figure beside a Copy button ────────────────────────────
 * The figures are fetched again every time the panel opens, and none is shown
 * until that fetch has landed. A stale number with a Copy button next to it is
 * the failure CLAUDE.md warns about in its sharpest form: it is not only
 * believed, it is typed into a customer's quote. The bid screen's refresh
 * helper invalidates it as well, for the same reason.
 *
 * ── A line with no price: no figures at all ──────────────────────────────────
 * Owner, 2026-09-29. The panel lists each such line and shows no bucket, no
 * total and no Copy until they are fixed. The blocked document has no money
 * in it, so there is nothing here that could render one.
 */
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Copy } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  clipboardAmount,
  CUSTOMER_PRICE_WORDING,
  displayAmount,
  type QuoteAppDoc,
} from "@shared/quoteAppExport";

export function QuoteAppPanel({
  bidId,
  open,
  onOpenChange,
}: {
  bidId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const utils = trpc.useUtils();
  const query = trpc.quoteApp.get.useQuery(
    { bidId },
    { enabled: open, retry: false }
  );
  // Fetched again on every open; see the header.
  useEffect(() => {
    if (open) void utils.quoteApp.get.invalidate({ bidId });
  }, [open, bidId, utils]);
  const doc = query.data as QuoteAppDoc | undefined;
  const settled = !query.isFetching && doc !== undefined;

  const [copied, setCopied] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  /** Shown, not only announced: a sighted person needs to know too. */
  const [copyFailed, setCopyFailed] = useState<string | null>(null);
  /** The figure shown in its pasteable form after a failed copy. */
  const [plain, setPlain] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const copy = async (key: string, label: string, text: string) => {
    try {
      /*
        Raced against a timer. Seen 2026-09-29: in a background tab
        `writeText` neither resolves nor rejects, and the button then did
        nothing at all — no flash, no message. A copy that has not answered in
        1.5 s is treated as failed, so the fallback below always runs.
      */
      await Promise.race([
        navigator.clipboard.writeText(text),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("clipboard timed out")), 1500)
        ),
      ]);
      setAnnounce(`Copied ${label}: ${text}`);
    } catch {
      /*
        No clipboard (an insecure page, a browser that refused, or one that
        never answered). Show the figure in its PASTEABLE form (`1452.00`,
        not `$1,452.00` — seen 2026-09-29, the selection held the dollar
        sign and comma a numeric field refuses) and select it, so a
        long-press copies what Copy would have. And say so.
      */
      setPlain(key);
      setTimeout(() => {
        const el = document.getElementById(`quote-figure-${key}`);
        if (!el) return;
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }, 0);
      setAnnounce(`Could not copy. ${label} is selected — copy it by hand.`);
      setCopyFailed(
        `Could not copy ${label}. It is selected — copy it by hand.`
      );
      return;
    }
    setCopyFailed(null);
    setPlain(null);
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Full height ONLY on a phone (`max-sm:`). It was `h-dvh … sm:h-auto`,
        and measured on a 1536px window the `h-dvh` still won: the desktop
        dialog stood 712px tall around 469px of content. A phone-only rule
        cannot leak onto a desktop, whatever order the rules land in.
      */}
      <DialogContent className="flex flex-col p-0 gap-0 max-h-[90dvh] sm:max-w-md max-sm:h-dvh max-sm:max-h-dvh max-sm:max-w-full max-sm:rounded-none">
        <DialogHeader className="shrink-0 border-b border-border px-5 pt-5 pb-3 text-left">
          <DialogTitle>For your quote app</DialogTitle>
          <DialogDescription className="text-foreground">
            <strong>What you charge the customer, before tax.</strong>{" "}
            {CUSTOMER_PRICE_WORDING.replace(
              "What you charge the customer, before tax. ",
              ""
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {query.error ? (
            <p className="text-sm text-destructive">{query.error.message}</p>
          ) : !settled ? (
            <p className="text-sm text-muted-foreground">Checking the bid…</p>
          ) : doc.state === "blocked" ? (
            <>
              <PlanWarnings lines={doc.planWarnings} />
              <Blocked doc={doc} />
            </>
          ) : (
            <>
              {doc.isSample && <SampleWarning />}
              <PlanWarnings lines={doc.planWarnings} />
              {doc.examplePricedLines > 0 && (
                <p className="flex items-start gap-1.5 text-xs text-[#F5C518]">
                  <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  {doc.examplePricedLines}{" "}
                  {doc.examplePricedLines === 1 ? "line uses" : "lines use"} an
                  example price. Check{" "}
                  {doc.examplePricedLines === 1 ? "it" : "them"} before quoting.
                </p>
              )}
              {doc.scopes.map((scope, s) => (
                <section
                  key={s}
                  className="rounded-lg border border-border"
                  aria-label={`Scope ${s + 1}`}
                >
                  <FigureRow
                    id={`scope-${s}`}
                    label={`Scope #${s + 1}`}
                    shown={scope.name}
                    text={scope.name}
                    copied={copied}
                    plain={plain}
                    onCopy={copy}
                    strong
                  />
                  {scope.buckets.map(bucket => (
                    <div key={bucket.bucket} className="border-t border-border">
                      {bucket.cents === null ? (
                        <div className="flex items-center justify-between px-3 py-2 text-sm">
                          <span>{bucket.bucket}</span>
                          <span className="text-muted-foreground">None</span>
                        </div>
                      ) : (
                        <FigureRow
                          id={`${s}-${bucket.bucket}`}
                          label={bucket.bucket}
                          shown={displayAmount(bucket.cents)}
                          text={clipboardAmount(bucket.cents)}
                          copied={copied}
                          plain={plain}
                          onCopy={copy}
                          mono
                        />
                      )}
                      {bucket.rows.length > 1 &&
                        bucket.rows.map((row, r) => (
                          <FigureRow
                            key={r}
                            id={`${s}-${bucket.bucket}-${r}`}
                            label={row.name}
                            shown={displayAmount(row.cents)}
                            text={clipboardAmount(row.cents)}
                            copied={copied}
                            plain={plain}
                            onCopy={copy}
                            mono
                            indent
                          />
                        ))}
                      {bucket.rows.length === 1 && (
                        <p className="px-3 pb-2 -mt-1 pl-6 text-xs text-muted-foreground">
                          {bucket.rows[0].name}
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              ))}

              <div className="flex items-baseline justify-between px-3 text-sm">
                <span className="text-muted-foreground">Total before tax</span>
                <span className="font-mono font-semibold">
                  {displayAmount(doc.preTaxCents)}
                </span>
              </div>
              <p className="px-3 -mt-2 text-xs text-muted-foreground">
                For checking — your quote app adds the buckets up itself.
              </p>

              <div className="space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                <p className="text-foreground">
                  Before tax. Your quote app adds its own tax, on labor as well
                  as material
                  {doc.taxOn
                    ? `, so its total will not match this bid's Total due (${displayAmount(doc.totalDueCents)}).`
                    : "."}
                </p>
                {doc.notes.map(note => (
                  <p key={note}>{note}</p>
                ))}
              </div>
            </>
          )}
        </div>
        {copyFailed && (
          <p className="shrink-0 border-t border-border px-5 py-2 text-xs text-[#F5C518]">
            {copyFailed}
          </p>
        )}
        <p className="sr-only" aria-live="polite">
          {announce}
        </p>
      </DialogContent>
    </Dialog>
  );
}

function SampleWarning() {
  return (
    <p className="flex items-start gap-1.5 rounded-md border border-[#F5C518]/40 bg-[#F5C518]/10 px-3 py-2 text-xs">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#F5C518]" />
      This is the example job. Its figures are not a real quote.
    </p>
  );
}

/**
 * Takeoff that is on the Plans screen and not on the bid (2026-09-29).
 * Warnings, not gaps: the figures are right for what IS on the bid, so they
 * are not held back — but a quote that looks finished while traced runs are
 * missing from it is exactly the silence the owner ruled out.
 */
function PlanWarnings({ lines }: { lines: readonly string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="flex items-start gap-1.5 rounded-md border border-[#F5C518]/40 bg-[#F5C518]/10 px-3 py-2 text-xs">
      <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0 text-[#F5C518]" />
      <ul className="space-y-1">
        {lines.map(line => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}

function Blocked({ doc }: { doc: Extract<QuoteAppDoc, { state: "blocked" }> }) {
  return (
    <div className="space-y-3">
      {doc.isSample && <SampleWarning />}
      {/*
        Advice per gap (audit #17, 2026-10-06). This said "Price them on the
        bid" for every one — wrong for a $0 labor rate or a traced part,
        which are fixed somewhere else entirely.
      */}
      <p className="text-sm">
        Some lines on this bid are not finished. Each one below says where to
        fix it; then come back for the figures.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {doc.gaps.map((gap, i) => (
          <li key={i} className="px-3 py-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="min-w-0 break-words">{gap.name}</span>
              <span className="shrink-0 font-medium text-[#F5C518]">
                {gap.status}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              {gap.detail} — {gap.fix}
            </p>
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        No figures are shown until every line has a price, so nothing short of
        the whole job can be copied into a quote.
      </p>
    </div>
  );
}

function FigureRow({
  id,
  label,
  shown,
  text,
  copied,
  plain,
  onCopy,
  mono,
  strong,
  indent,
}: {
  id: string;
  label: string;
  shown: string;
  text: string;
  copied: string | null;
  /** This row's figure is shown as `text` — after a copy that failed. */
  plain: string | null;
  onCopy: (key: string, label: string, text: string) => void;
  mono?: boolean;
  strong?: boolean;
  indent?: boolean;
}) {
  const done = copied === id;
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-sm transition-colors",
        indent && "pl-6 text-xs",
        done && "bg-emerald-500/15"
      )}
    >
      <span
        className={cn(
          "min-w-0 flex-1 break-words",
          indent && "text-muted-foreground",
          strong && "font-medium"
        )}
      >
        {label}
      </span>
      <span
        id={`quote-figure-${id}`}
        className={cn(
          "text-right",
          mono && "font-mono",
          strong && "min-w-0 max-w-[55%] truncate",
          done && "text-emerald-500"
        )}
      >
        {plain === id ? text : shown}
      </span>
      <button
        type="button"
        className={cn(
          "shrink-0 inline-flex h-9 w-9 items-center justify-center rounded-md border border-border hover:bg-muted",
          done && "border-emerald-500 text-emerald-500"
        )}
        onClick={() => void onCopy(id, label, text)}
        aria-label={`Copy ${label}`}
        title={`Copy ${text}`}
      >
        {done ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  );
}
