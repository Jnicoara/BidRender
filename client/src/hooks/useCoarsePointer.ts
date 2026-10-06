import { useEffect, useState } from "react";

/**
 * Is a finger the main pointer — `(pointer: coarse)` — live.
 *
 * For the few places that must SAY something different to a finger: a hint
 * reading "Shift-click" or "Esc to stop" is an instruction a tablet cannot
 * follow (references/device-audit.md § Touch). Sizing is not done through
 * this: tap targets grow in CSS (`index.css`, the coarse-pointer block), so
 * nothing has to remember to ask.
 */
export function useCoarsePointer(): boolean {
  const query = "(pointer: coarse)";
  const [coarse, setCoarse] = useState(
    () => typeof window !== "undefined" && window.matchMedia(query).matches
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setCoarse(mq.matches);
    mq.addEventListener("change", update);
    update();
    return () => mq.removeEventListener("change", update);
  }, []);
  return coarse;
}
