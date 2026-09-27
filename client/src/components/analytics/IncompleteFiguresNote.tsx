/**
 * "2 bids in this range have lines that can't be priced" — said above the
 * analytics dollar figures whenever any of them leave something out.
 *
 * One component for both analytics panels, and worded to match the
 * "incomplete" tag the bid screen, cards, search and archive already wear
 * (IncompletePriceTag): a total with a line missing is short, and a short
 * total that reads as a whole one gets believed. Absent when nothing is
 * missing, so it never becomes wallpaper.
 */
export function IncompleteFiguresNote({
  count,
  noun,
}: {
  count: number;
  noun: [one: string, many: string];
}) {
  if (count <= 0) return null;
  return (
    <p className="text-xs text-red-500" role="status">
      <span className="font-medium">incomplete</span> — {count}{" "}
      {count === 1 ? noun[0] : noun[1]} in this range{" "}
      {count === 1 ? "has" : "have"} a line that can&apos;t be priced, so the
      dollar figures here leave {count === 1 ? "it" : "those lines"} out. On the
      dashboard, {count === 1 ? "the bid is" : "the bids are"} marked
      “incomplete”.
    </p>
  );
}
