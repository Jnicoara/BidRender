/**
 * Reading the emailed reset link: `#/reset-password?token=…`.
 *
 * The token is in the HASH so the browser never sends it to a server
 * (server/passwordReset.ts). It is still in the address bar, though, and the
 * address bar is shared history, synced tabs and screenshots — so the reset
 * page reads the token once and replaces the address with `RESET_ADDRESS`,
 * token gone (`ResetPasswordPage`).
 *
 * Pure, and in `lib`, so the parsing has tests; the component cannot.
 */
export const RESET_ADDRESS = "#/reset-password";

/** Whether this address is the reset page, with or without a token. */
export function isResetAddress(hash: string): boolean {
  const path = hash.split("?")[0].replace(/\/+$/, "");
  return path === RESET_ADDRESS;
}

/** The token in a reset address, or null when there is none. */
export function resetTokenFromHash(hash: string): string | null {
  if (!isResetAddress(hash)) return null;
  const query = hash.split("?")[1];
  if (!query) return null;
  const token = new URLSearchParams(query).get("token")?.trim();
  return token ? token : null;
}
