/**
 * A password hash must never reach the browser.
 *
 * `auth.me` returned the `users` row as the database hands it over, so every
 * signed-in browser received that account's bcrypt hash — and `useAuth` writes
 * what it receives into `localStorage`, putting it on disk as well.
 *
 * These pin both halves: the answer the browser actually gets, and the rule
 * that decides it. The last test is the one that matters in a year — it fails
 * when a column is added to `users` and nobody has said whether it may leave.
 *
 * No database: `auth.me` reads the context and returns it.
 */
import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/mysql-core";
import { appRouter } from "./routers";
import { users } from "../drizzle/schema";
import type { TrpcContext } from "./_core/context";
import {
  NEVER_SENT_USER_FIELDS,
  PUBLIC_USER_FIELDS,
  toPublicUser,
} from "../shared/publicUser";

/** A signed-in caller whose row carries every secret the table can hold. */
function contextWithUser(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "open-id-used-to-mint-sessions",
      name: "Test User",
      email: "test@example.com",
      passwordHash: "$2b$12$thisIsTheHashThatMustNeverLeave",
      loginMethod: "email",
      emailVerified: false,
      role: "admin",
      accessTier: "internal",
      activeCompanyId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
      onboardingCompletedAt: new Date(),
      checklistDismissedAt: null,
    } as unknown as TrpcContext["user"],
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("what auth.me sends to the browser", () => {
  it("does not include the password hash", async () => {
    const me = await appRouter.createCaller(contextWithUser()).auth.me();

    expect(me).not.toBeNull();
    expect(me).not.toHaveProperty("passwordHash");
    expect(JSON.stringify(me)).not.toContain("thisIsTheHashThatMustNeverLeave");
  });

  it("sends nothing beyond the allowed fields", async () => {
    const me = await appRouter.createCaller(contextWithUser()).auth.me();

    expect(Object.keys(me!).sort()).toEqual([...PUBLIC_USER_FIELDS].sort());
  });

  it("still sends what the screens actually read", async () => {
    const me = await appRouter.createCaller(contextWithUser()).auth.me();

    // AdminSettingsPage and the shell gate on role; Settings shows email/name.
    expect(me!.role).toBe("admin");
    expect(me!.email).toBe("test@example.com");
    expect(me!.name).toBe("Test User");
  });

  it("answers null for a caller who is not signed in", async () => {
    const ctx = { ...contextWithUser(), user: null };
    expect(await appRouter.createCaller(ctx).auth.me()).toBeNull();
  });
});

describe("the rule itself", () => {
  it("withholds the hash and the session identifier", () => {
    const out = toPublicUser({
      id: 1,
      passwordHash: "secret",
      openId: "secret",
      name: "x",
    });

    expect(out).not.toHaveProperty("passwordHash");
    expect(out).not.toHaveProperty("openId");
    expect(out!.name).toBe("x");
  });

  it("builds by picking, so an unknown field cannot ride along", () => {
    const out = toPublicUser({
      id: 1,
      recoveryCodeAddedNextYear: "should not appear",
    });

    expect(JSON.stringify(out)).not.toContain("should not appear");
  });

  /**
   * The drift guard. A new column on `users` fails here until someone lists it
   * as public or as never-sent — which is the moment to think about it, rather
   * than after it is in somebody's browser storage.
   */
  it("classifies every column the users table has", () => {
    const columns = getTableConfig(users).columns.map(c => c.name);
    const classified = new Set<string>([
      ...PUBLIC_USER_FIELDS,
      ...NEVER_SENT_USER_FIELDS,
    ]);

    const unclassified = columns.filter(name => !classified.has(name));

    expect(
      unclassified,
      `New column(s) on "users" that nobody has classified: ${unclassified.join(", ")}. ` +
        `Add each to PUBLIC_USER_FIELDS or NEVER_SENT_USER_FIELDS in shared/publicUser.ts.`
    ).toEqual([]);
  });

  it("never lists a withheld field as public", () => {
    for (const field of NEVER_SENT_USER_FIELDS) {
      expect(PUBLIC_USER_FIELDS as readonly string[]).not.toContain(field);
    }
  });
});
