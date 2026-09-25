/**
 * The crosshair colour this person picked in Settings → Display.
 *
 * Stored on the device, like the rest of Display, but keyed by the signed-in
 * user — so two estimators sharing one laptop each keep their own. A value
 * this build does not know (an older build, a hand-edit) reads as the default
 * rather than as no cursor at all; see `asCrosshairColor`.
 */
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { trpc } from "@/lib/trpc";
import {
  asCrosshairColor,
  DEFAULT_CROSSHAIR_COLOR,
  type CrosshairColor,
} from "@/lib/crosshairCursor";

export function useCrosshairColor(): [
  CrosshairColor,
  (color: CrosshairColor) => void,
] {
  // The same cached query every screen already holds; no extra request.
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [stored, setStored] = useLocalStorage<string>(
    `bp_crosshair_color:${me.data?.id ?? "anon"}`,
    DEFAULT_CROSSHAIR_COLOR
  );
  return [asCrosshairColor(stored), setStored];
}
