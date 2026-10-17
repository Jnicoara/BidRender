/**
 * When a form's stored row arrives again — a background refetch, another
 * save, a window coming back into focus — which boxes may it rewrite?
 *
 * Only the ones the person has NOT changed. A box still showing exactly what
 * was last shown from storage takes the new stored text; a box whose text
 * differs is being typed in, and is left alone until its own commit or
 * revert.
 *
 * Found by the whole-job journey in CI (2026-10-16): Settings › Pricing
 * re-showed every box whenever the defaults query refetched, so a "20"
 * typed into Profit became "0" under the cursor, Enter then committed the 0
 * it read, and nothing was saved — with no message. The refetch was the
 * cache from the first-run screen being refreshed as the page opened.
 */
export function refreshUneditedText<K extends string>(
  current: Record<K, string>,
  lastShown: Record<K, string> | null,
  nextStored: Record<K, string>
): Record<K, string> {
  if (lastShown === null) return { ...nextStored };
  const out = { ...current };
  for (const key of Object.keys(nextStored) as K[]) {
    if (current[key] === lastShown[key]) out[key] = nextStored[key];
  }
  return out;
}
