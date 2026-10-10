import { useEffect, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { createMissRecorder } from "@/lib/noMatchLog";
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
 *
 * Returns `recordNow`: call it when the person acts on a search that found
 * nothing (Enter, "Count it anyway", "Build it from parts here"), so a fast
 * type-and-Enter is recorded instead of being lost to the settle time. It
 * does nothing when the box is not on a miss. The rule is
 * `createMissRecorder` in @/lib/noMatchLog, where the suite can reach it.
 */
export function useNoMatchLog(
  picker: SearchMissPicker,
  query: string,
  resultCount: number,
  ready: boolean
): () => void {
  const record = trpc.searchMisses.record.useMutation();
  const send = useRef(record.mutate);
  send.current = record.mutate;
  const pickerRef = useRef(picker);
  pickerRef.current = picker;

  const recorder = useRef<ReturnType<typeof createMissRecorder> | null>(null);
  if (recorder.current === null)
    recorder.current = createMissRecorder(
      words => send.current({ picker: pickerRef.current, words }),
      {
        set: (fire, ms) => setTimeout(fire, ms),
        clear: handle => clearTimeout(handle as ReturnType<typeof setTimeout>),
      },
      SEARCH_MISS_SETTLE_MS
    );

  useEffect(() => {
    recorder.current?.observe({ query, resultCount, ready });
  }, [picker, query, resultCount, ready]);

  useEffect(() => () => recorder.current?.dispose(), []);

  const recordNow = useRef(() => recorder.current?.now());
  return recordNow.current;
}
