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
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );
  const copy = async (key: string, label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setAnnounce(`Copied ${label}: ${text}`);
    } catch {
      /*
        No clipboard (an insecure page, or a browser that refused). Select the
        figure instead, so a long-press copies it — and say so.
      */
      const el = document.getElementById(`quote-figure-${key}`);
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      setAnnounce(`Could not copy. ${label} is selected — copy it by hand.`);
      return;
    }
    setCopied(key);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1200);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex flex-col h-dvh max-h-dvh w-full max-w-full rounded-none p-0 gap-0 sm:h-auto sm:max-h-[90dvh] sm:max-w-md sm:rounded-lg">
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
            <Blocked doc={doc} />
          ) : (
            <>
              {doc.isSample && <SampleWarning />}
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

function Blocked({ doc }: { doc: Extract<QuoteAppDoc, { state: "blocked" }> }) {
  return (
    <div className="space-y-3">
      {doc.isSample && <SampleWarning />}
      <p className="text-sm">
        This bid has lines without a price. Price them on the bid, then come
        back for the figures.
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
            <p className="text-xs text-muted-foreground">{gap.detail}</p>
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
        {shown}
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
