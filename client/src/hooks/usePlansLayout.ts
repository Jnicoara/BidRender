import { useEffect, useState } from "react";
import { plansLayout, type PlansLayout } from "@/lib/plansLayout";

/**
 * The Plans screen's layout, live: the rule is `plansLayout` in @/lib, and
 * this only reads the window and listens for it changing — a resize, or a
 * tablet turned mid-count. Everything on the screen asks this one hook.
 */
export function usePlansLayout(): PlansLayout {
  const read = (): PlansLayout =>
    typeof window === "undefined"
      ? "laptop"
      : plansLayout({
          width: window.innerWidth,
          coarse: window.matchMedia("(pointer: coarse)").matches,
          portrait: window.matchMedia("(orientation: portrait)").matches,
        });
  const [layout, setLayout] = useState<PlansLayout>(read);
  useEffect(() => {
    const update = () => setLayout(read());
    const queries = [
      window.matchMedia("(pointer: coarse)"),
      window.matchMedia("(orientation: portrait)"),
    ];
    window.addEventListener("resize", update);
    queries.forEach(q => q.addEventListener("change", update));
    update();
    return () => {
      window.removeEventListener("resize", update);
      queries.forEach(q => q.removeEventListener("change", update));
    };
  }, []);
  return layout;
}
