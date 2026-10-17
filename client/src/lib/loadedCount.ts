/**
 * The count beside a paged list's tab. It counts rows LOADED, so while more
 * pages remain it is a floor, and says so: "50+". Until 2026-10-16 the
 * Clients tabs showed the bare 50 for a company with 400 clients (copy pass).
 */
export function loadedCountLabel(loaded: number, hasMore: boolean): string {
  return hasMore ? `${loaded}+` : String(loaded);
}
