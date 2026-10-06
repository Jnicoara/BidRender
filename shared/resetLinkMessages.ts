/**
 * What a reset link that cannot be used says — ONE sentence for the two
 * places that say it: the page as soon as it opens (`auth.checkResetToken`)
 * and the server on Save (`auth.resetPassword`). Two copies would drift.
 */
export const RESET_LINK_UNUSABLE =
  "This reset link has expired or has already been used. Ask for a new one from the sign-in page.";
