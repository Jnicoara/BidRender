/**
 * An amber warning on a bid line that OPENS ITS FIX when tapped — "Not
 * priced", "Hours not set", "+ 1 part not priced" (references/never-stuck-
 * plan.md, gap 11: "each become a button"). Without `onFix` it is the plain
 * label it always was, so the Count screen, which shares `LineCost`, is
 * unchanged.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FixableLabel({
  onFix,
  className,
  children,
}: {
  onFix?: () => void;
  className?: string;
  children: ReactNode;
}) {
  if (!onFix) return <span className={className}>{children}</span>;
  return (
    <button
      type="button"
      onClick={onFix}
      className={cn(
        "underline decoration-dotted underline-offset-2 hover:decoration-solid",
        className
      )}
    >
      {children}
    </button>
  );
}
