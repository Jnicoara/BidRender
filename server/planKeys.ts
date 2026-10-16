/**
 * IS THIS STORAGE KEY ONE THIS SERVER ISSUED FOR THIS BID?
 *
 * Every plan-upload call that takes a key back from the browser asks this
 * (server/routers/bidPdfsRouter.ts), because the key is what a row will later
 * serve — a key naming another company's object would serve their plans.
 *
 * Security sweep, 2026-10-14: the check was a bare `startsWith`, so
 * `bid-plans/5/7/../../9/8/theirs.pdf` passed it. Whether a store resolves
 * `..` depends on the store and everything in front of it (the disk store
 * refuses it — diskStorage.ts — R2 and Cloudflare's edge are not ours to
 * rely on), so a key with a `.`, `..` or empty segment, or a backslash, is
 * refused here whatever is behind it. Keys this server mints never contain
 * one: the filename segment is the uploader's, and it is the LAST segment.
 */
export function ownsPlanKey(
  storageKey: string,
  dataUserId: number,
  bidId: number
): boolean {
  const prefix = `bid-plans/${dataUserId}/${bidId}/`;
  if (!storageKey.startsWith(prefix)) return false;
  if (storageKey.includes("\\")) return false;
  return storageKey
    .split("/")
    .every(segment => segment !== "" && segment !== "." && segment !== "..");
}
