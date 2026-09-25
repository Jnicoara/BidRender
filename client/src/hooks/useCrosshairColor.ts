/**
 * The crosshair colour and size this person picked in Settings → Display.
 *
 * Stored on the device, like the rest of Display, but keyed by the signed-in
 * user — so two estimators sharing one laptop each keep their own. A value
 * this build does not know (an older build, a hand-edit) reads as the default
 * rather than as no cursor at all; see `asCrosshairColor` / `asCrosshairSize`.
 *
 * Size was added 2026-09-25 and saves the same way, under its own key, so a
 * device that already has a colour stored keeps it and simply starts at the
 * default size.
 */
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { trpc } from "@/lib/trpc";
import {
  asCrosshairColor,
  asCrosshairSize,
  DEFAULT_CROSSHAIR_COLOR,
  DEFAULT_CROSSHAIR_SIZE,
  type CrosshairColor,
  type CrosshairSize,
} from "@/lib/crosshairCursor";

function useMeId(): number | "anon" {
  // The same cached query every screen already holds; no extra request.
  const me = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  return me.data?.id ?? "anon";
}

export function useCrosshairColor(): [
  CrosshairColor,
  (color: CrosshairColor) => void,
] {
  const id = useMeId();
  const [stored, setStored] = useLocalStorage<string>(
    `bp_crosshair_color:${id}`,
    DEFAULT_CROSSHAIR_COLOR
  );
  return [asCrosshairColor(stored), setStored];
}

export function useCrosshairSize(): [
  CrosshairSize,
  (size: CrosshairSize) => void,
] {
  const id = useMeId();
  const [stored, setStored] = useLocalStorage<string>(
    `bp_crosshair_size:${id}`,
    DEFAULT_CROSSHAIR_SIZE
  );
  return [asCrosshairSize(stored), setStored];
}
