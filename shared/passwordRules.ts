/**
 * What a new password must satisfy — ONE list, read by the server that
 * enforces it and the screens that explain it.
 *
 * It used to live twice: the rule checklist in `LoginPage.tsx` and the zod
 * refinements in `authRouter.signup`. The reset page is a third place that
 * sets a password, and a third copy is how a screen ends up showing a green
 * tick for a password the server then refuses. So the list moved here, and
 * both sides read it.
 */
export const PASSWORD_RULES = [
  {
    id: "length",
    label: "At least 8 characters",
    message: "Password must be at least 8 characters",
    test: (p: string) => p.length >= 8,
  },
  {
    id: "upper",
    label: "One uppercase letter (A–Z)",
    message: "Password must contain at least one uppercase letter",
    test: (p: string) => /[A-Z]/.test(p),
  },
  {
    id: "number",
    label: "One number (0–9)",
    message: "Password must contain at least one number",
    test: (p: string) => /[0-9]/.test(p),
  },
  {
    id: "special",
    label: "One special character (!@#$%^&*…)",
    message: "Password must contain at least one special character",
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
  },
] as const;

/** The longest password accepted — bcrypt reads at most 72 bytes anyway. */
export const PASSWORD_MAX_LENGTH = 128;

export function isPasswordValid(p: string): boolean {
  return (
    p.length <= PASSWORD_MAX_LENGTH && PASSWORD_RULES.every(r => r.test(p))
  );
}

/** The first rule a password breaks, as a sentence, or null when it passes. */
export function passwordProblem(p: string): string | null {
  if (p.length > PASSWORD_MAX_LENGTH)
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
  return PASSWORD_RULES.find(r => !r.test(p))?.message ?? null;
}
