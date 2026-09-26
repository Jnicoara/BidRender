/**
 * "incomplete", beside a price that leaves something out.
 *
 * A bid with a line the engine could not price is priced WITHOUT that line
 * (shared/linePricingProblems.ts), so every figure shown for it is short. Each
 * screen that shows such a figure puts this beside it — the bid's headline, a
 * dashboard card, a search result, the archive, Quick Bid — so a short number
 * never reads as the bid's value. One component so the word, the colour and
 * the explanation cannot drift apart between them.
 */
export function IncompletePriceTag({
  show,
  className = "",
}: {
  show: boolean;
  className?: string;
}) {
  if (!show) return null;
  return (
    <span
      className={`text-xs font-normal font-sans text-red-500 ${className}`}
      title="Something on this bid can't be priced, so this figure leaves it out. Open the bid to see what."
    >
      incomplete
    </span>
  );
}
