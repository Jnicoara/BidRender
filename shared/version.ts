/**
 * The app version shown in the UI.
 *
 * This lives in one place because it did not used to: the sidebar and the home
 * page each hardcoded their own string and drifted apart (v5.50 and v5.46),
 * so the app told you two different things about itself depending on where you
 * looked. Import APP_VERSION_LABEL rather than writing a version literal into
 * a component.
 *
 * The number tracks the `vX.YY` checkpoint convention used in commit messages
 * (see CLAUDE.md § Conventions) — bump it here when a checkpoint ships.
 */
/**
 * ── Why this went to 6.0 rather than 5.98 ────────────────────────────────────
 * Two reasons, one bookkeeping and one real.
 *
 * The bookkeeping one: `v5.98` is already spoken for. todo.md uses it as the
 * heading for a Manus-side stale-test-data cleanup, and there is no
 * `Ship v5.98` commit and no bump behind it. Reusing the number would put two
 * different things under one label in the only two places versions are written
 * down.
 *
 * The real one: what shipped between v5.97 and here is not a point release.
 * The trade axis reached the whole data model, so the claim CLAUDE.md opens
 * with — electrical-first by sequencing, not electrical-only by design — is now
 * true of the schema rather than only of the plan. Clients became a first-class
 * record with a screen. And the way into the app changed: the splash page went,
 * and the Dashboard grew the two real entry points. A major is the honest label
 * for a foundation change plus a new entity plus a new front door.
 */
export const APP_VERSION = "v6.1";

/** Edition suffix — the app is field-first, and the tag has always said so. */
export const APP_EDITION = "Field Edition";

/** What the UI actually renders, e.g. "v5.97 · Field Edition". */
export const APP_VERSION_LABEL = `${APP_VERSION} · ${APP_EDITION}`;
