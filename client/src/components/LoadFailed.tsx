/**
 * A LIST THAT FAILED TO LOAD IS NOT AN EMPTY LIST.
 *
 * Found by the failure drill, 2026-10-14 (references/stress-results.md):
 * with the database unreachable, the Dashboard said "No bids yet" to a
 * company with 150, the Plans list "No plans yet", Recently deleted "Nothing
 * here" — a deleted bid you came to restore, reported gone — and the Bids
 * list "Bids you create will show up here". Each read a failed query's empty
 * default as an answer. This says what happened and offers the retry.
 */
import { Button } from "@/components/ui/button";

export function LoadFailed({
  what,
  onRetry,
}: {
  /** Plural, lower case: "your bids", "your plans". */
  what: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-dashed border-border p-8 text-center space-y-2"
    >
      <p className="text-sm text-foreground">Couldn't load {what}.</p>
      <p className="text-xs text-muted-foreground">
        Nothing is lost — this is a connection problem. Try again in a moment.
      </p>
      <Button size="sm" variant="outline" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}
