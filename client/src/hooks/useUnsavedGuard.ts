import { useCallback, useEffect, useRef } from "react";
import { askToLeave, markUnsaved } from "@/lib/unsavedGuard";

/**
 * An editor holding unsaved work: the shell asks before following a nav
 * link or Back (@/lib/unsavedGuard), the browser asks before a reload or a
 * closed tab, and the returned `leave` asks before the editor's own Back.
 */
export function useUnsavedGuard(dirty: boolean) {
  const owner = useRef(Symbol("unsaved-editor"));

  useEffect(() => {
    const id = owner.current;
    markUnsaved(id, dirty);
    return () => markUnsaved(id, false);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Older browsers need a value set to show their prompt.
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  return useCallback((leave: () => void) => {
    askToLeave(leave);
  }, []);
}
