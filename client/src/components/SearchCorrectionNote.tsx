/**
 * "Showing results for receptacle." — said wherever a material search
 * corrected a typo (useMaterialSearch → smartSearchCorrected).
 *
 * One component for every search box, so the wording and the look cannot
 * drift between the Materials list, the supplier-pricing tab and the bid
 * pickers. It says what WAS searched rather than what was typed, because
 * that is the fact the estimator needs: the list below is receptacles, and
 * if receptacles are not what they meant, this is where they find out.
 */
export function SearchCorrectionNote({
  correctedQuery,
  className,
}: {
  correctedQuery: string | null;
  className?: string;
}) {
  if (!correctedQuery) return null;
  return (
    <p
      className={"text-xs text-muted-foreground " + (className ?? "")}
      role="status"
    >
      Showing results for{" "}
      <span className="font-medium text-foreground">{correctedQuery}</span>.
    </p>
  );
}
