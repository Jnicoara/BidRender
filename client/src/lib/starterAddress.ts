/**
 * The starter editor's pages live at `/starter`, OUTSIDE the company app
 * (baseline-screen-plan.md § 1). Not a hash route: the app's routing is all
 * hash-based under `/`, and every address there sits behind the company
 * sign-in (AuthGuard). The starter editor has no company login at all, so
 * its pages must be decided before AuthGuard runs — by the pathname, which
 * no hash route can produce.
 */
export const STARTER_PATH = "/starter";

export function isStarterAddress(pathname: string): boolean {
  const path = pathname.toLowerCase().replace(/\/+$/, "");
  return path === STARTER_PATH || path.startsWith(`${STARTER_PATH}/`);
}

/**
 * "Signs out at 3:42 PM if idle" — the session slides with every call, up
 * to 8 hours from the password step, so the time is what the server last
 * said, never counted down here. Past it: "Session ended".
 */
export function starterSessionNote(
  sessionEndsAt: number,
  now: number,
  formatTime: (ms: number) => string = ms =>
    new Date(ms).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })
): string {
  if (sessionEndsAt <= now) return "Session ended";
  return `Signs out at ${formatTime(sessionEndsAt)} if idle`;
}

/** The baseline screen's tabs, in order, as they appear in the address. */
export const STARTER_TABS = [
  "materials",
  "assemblies",
  "labor-rates",
  "run-types",
  // Every starter change, newest first, with Undo (starter-offers-plan.md
  // § 4 step 4).
  "changes",
] as const;
export type StarterTab = (typeof STARTER_TABS)[number];

/** `#assemblies` → "assemblies"; anything else → the first tab. */
export function starterTabFromHash(hash: string): StarterTab {
  const key = hash.replace(/^#\/?/, "").toLowerCase();
  return (STARTER_TABS as readonly string[]).includes(key)
    ? (key as StarterTab)
    : STARTER_TABS[0];
}
