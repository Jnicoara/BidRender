import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { missToRecord } from "@/lib/noMatchLog";
import {
  SEARCH_MISS_SETTLE_MS,
  type SearchMissPicker,
} from "@shared/searchMiss";

/**
 * Record a picker search that settled on nothing (shared/searchMiss.ts).
 *
 * Fires only after the box has sat on the same no-result words for
 * SEARCH_MISS_SETTLE_MS, so a word typed slowly is not logged once per
 * prefix. Silent either way: the person searching never sees it, and a
 * failed write never interrupts them — the log is for us, not for them.
 */
export function useNoMatchLog(
  picker: SearchMissPicker,
  query: string,
  resultCount: number,
  ready: boolean
): void {
  const record = trpc.searchMisses.record.useMutation();
  const send = useRef(record.mutate);
  send.current = record.mutate;
  const sent = useRef(new Set<string>());

  useEffect(() => {
    const words = missToRecord({
      query,
      resultCount,
      ready,
      alreadySent: sent.current,
    });
    if (words === null) return;
    const timer = setTimeout(() => {
      sent.current.add(words);
      send.current({ picker, words });
    }, SEARCH_MISS_SETTLE_MS);
    return () => clearTimeout(timer);
  }, [picker, query, resultCount, ready]);
}
