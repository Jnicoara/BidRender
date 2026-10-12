import type { User } from "../../drizzle/schema";

/** The master account that edits the shipped starter (0150). */
export const STARTER_ROLE = "starter_editor" as const;

export function isStarterEditor(
  user: Pick<User, "role"> | null | undefined
): boolean {
  return user?.role === STARTER_ROLE;
}
