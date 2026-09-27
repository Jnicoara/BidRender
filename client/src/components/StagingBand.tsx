/**
 * The yellow STAGING strip across the top of every screen on the staging site.
 *
 * Rendered from main.tsx, OUTSIDE <App />, so it survives the error screen
 * too — the one moment it would be easiest to forget which site you are on.
 *
 * It takes no room from the layout by itself: it is fixed, and index.css
 * shrinks every `h-dvh` / `min-h-dvh` container by its height while
 * `<html data-env="staging">` is set. Without that, the band would sit on top
 * of the header, or push the bottom of every full-height screen — the bid
 * totals among them — out of the window (CLAUDE.md § Responsiveness, rule 4).
 */
export default function StagingBand() {
  return (
    <div
      role="status"
      className="staging-band fixed inset-x-0 top-0 z-[2147483647] flex items-center justify-center gap-2 bg-[#F5C518] px-4 text-[12px] font-bold tracking-wide text-black"
    >
      <span>STAGING</span>
      <span className="font-medium">· practice copy, not the live site</span>
    </div>
  );
}
