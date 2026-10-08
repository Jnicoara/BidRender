/**
 * "2 bids in this range have lines that can't be priced" — said above the
 * analytics dollar figures whenever any of them leave something out.
 *
 * One component for both analytics panels, and worded to match the
 * "incomplete" tag the bid screen, cards, search and archive already wear
 * (IncompletePriceTag): a total with a line missing is short, and a short
 * total that reads as a whole one gets believed. Absent when nothing is
 * missing, so it never becomes wallpaper.
 *
 * ── Two facts, two sentences (2026-09-27) ────────────────────────────────────
 * A line that CAN'T be priced is left out of the figures (red, "incomplete").
 * A line nobody has priced YET is in them at $0 (amber, the colour of the
 * "not priced" the bid and the Dashboard use). Until this date the second
 * one was not said at all, so a range full of unpriced lines read as a
 * finished set of numbers.
 */
export function IncompleteFiguresNote({
  count,
  notPricedCount = 0,
  notPricedBids = [],
  onOpenBid,
  noun,
}: {
  /** Bids or jobs carrying a line that can't be priced. */
  count: number;
  /** Bids or jobs carrying lines or parts nobody has priced. */
  notPricedCount?: number;
  /**
   * The first of those by name (server `notPricedNamed`), each a button that
   * opens the bid — the count alone was a dead end (never-stuck plan, gap 7).
   */
  notPricedBids?: readonly { bidId: number; name: string }[];
  onOpenBid?: (bidId: number) => void;
  noun: [one: string, many: string];
}) {
  if (count <= 0 && notPricedCount <= 0) return null;
  return (
    <div className="space-y-1" role="status">
      {count > 0 && (
        <p className="text-xs text-red-500">
          <span className="font-medium">incomplete</span> — {count}{" "}
          {count === 1 ? noun[0] : noun[1]} in this range{" "}
          {count === 1 ? "has" : "have"} a line that can&apos;t be priced, so
          the dollar figures here leave {count === 1 ? "it" : "those lines"}{" "}
          out. On the dashboard, {count === 1 ? "the bid is" : "the bids are"}{" "}
          marked “incomplete”.
        </p>
      )}
      {notPricedCount > 0 && (
        <p className="text-xs text-[#F5C518]">
          <span className="font-medium">not priced</span> — {notPricedCount}{" "}
          {notPricedCount === 1 ? noun[0] : noun[1]} in this range{" "}
          {notPricedCount === 1 ? "has" : "have"} lines or parts nobody has
          priced. The dollar figures here count them as $0.
        </p>
      )}
      {notPricedCount > 0 && onOpenBid && notPricedBids.length > 0 && (
        <p className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Open to price:</span>
          {notPricedBids.map(b => (
            <button
              key={b.bidId}
              type="button"
              onClick={() => onOpenBid(b.bidId)}
              className="text-[#F5C518] underline underline-offset-2 hover:decoration-solid [@media(pointer:coarse)]:min-h-11"
            >
              {b.name}
            </button>
          ))}
          {notPricedCount > notPricedBids.length && (
            <span>and {notPricedCount - notPricedBids.length} more</span>
          )}
        </p>
      )}
    </div>
  );
}
