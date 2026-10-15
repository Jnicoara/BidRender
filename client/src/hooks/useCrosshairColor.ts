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
import { GUIDE_DEFAULT, parseGuideState, type GuideState } from "@/lib/guide";
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

/**
 * Whether the dim "Next" length follows the cursor while tracing. Default ON.
 *
 * Off hides only the label. The thin preview line stays, because without it
 * nobody can see where the next click will go (Track B plan, Part 2).
 */
export function useShowNextSegment(): [boolean, (show: boolean) => void] {
  const id = useMeId();
  const [stored, setStored] = useLocalStorage<boolean>(
    `bp_trace_show_next:${id}`,
    true
  );
  // Anything but an explicit false reads as the default.
  return [stored !== false, setStored];
}

/**
 * Whether a bid shows its step bar (Plans › Scale › Count › Runs › Review ›
 * Print, `BidStepBar`). Default ON (owner, 2026-10-14); a person who knows
 * their own flow can turn it off in Settings › Display. Per person, on this
 * browser — a view preference, never a company setting.
 */
export function useShowStepBar(): [boolean, (show: boolean) => void] {
  const id = useMeId();
  const [stored, setStored] = useLocalStorage<boolean>(
    `bp_show_step_bar:${id}`,
    true
  );
  return [stored !== false, setStored];
}

/**
 * Guide mode (client/src/lib/guide.ts): on, and which tips were closed.
 * Default ON and stays on until turned off (owner, 2026-10-14). Per person,
 * on this browser, like the step bar — a view preference, never a company
 * setting, and it renders fine with storage blocked.
 */
export function useGuideState(): [GuideState, (next: GuideState) => void] {
  const id = useMeId();
  const [stored, setStored] = useLocalStorage<unknown>(
    `bp_guide:${id}`,
    GUIDE_DEFAULT
  );
  return [parseGuideState(stored), setStored];
}
