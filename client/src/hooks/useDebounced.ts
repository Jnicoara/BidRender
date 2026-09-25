import { useEffect, useState } from "react";

/**
 * Hold a value still until it stops changing for `ms`.
 *
 * For search boxes whose query goes to the server: a keystroke should not be a
 * request. Shared by the bid search (BidSearchPanel) and the plan search in
 * the sheet chip (SheetChip), so both wait the same way.
 */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
