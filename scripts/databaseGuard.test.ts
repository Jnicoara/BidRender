/**
 * The guard that stops a script writing to a database that is not this machine.
 *
 * ── What is worth testing here ───────────────────────────────────────────────
 * Not that it lets localhost through — that is the easy half. What matters is
 * that it REFUSES in every case where it cannot prove the target is safe: a
 * remote host, a missing url, a url it cannot parse, and an override that is
 * present but not the word it wants. Each of those is a path somebody could
 * otherwise take to production by accident, which is how this came to exist.
 */
import { describe, it, expect } from "vitest";
import {
  checkTestDatabase,
  checkWritableDatabase,
  OVERRIDE_VAR,
  OVERRIDE_VALUE,
} from "./databaseGuard";

const action = "apply migrations";
const check = (url: string | undefined, env: Record<string, string> = {}) =>
  checkWritableDatabase(url, { action, env });

describe("a local database is allowed", () => {
  it("accepts the loopback host, however it is spelled", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]"]) {
      const result = check(`mysql://u:p@${host}:3307/bidrender_local`);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.reason).toBe("local");
    }
  });

  it("does not need the override to work locally", () => {
    // The guard must be invisible in ordinary development, or people will find
    // a way around it and the one case that matters goes with them.
    expect(check("mysql://u:p@127.0.0.1:3307/x").ok).toBe(true);
  });
});

describe("a remote database is REFUSED", () => {
  it("refuses a managed host", () => {
    const result = check(
      "mysql://app:pw@db-mysql-nyc3-12345.b.db.ondigitalocean.com:25060/bidrender"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.host).toContain("ondigitalocean.com");
      // The message has to say what to do, or somebody will delete the guard.
      expect(result.message).toContain(OVERRIDE_VAR);
      expect(result.message).toContain(action);
    }
  });

  it("refuses a host that merely LOOKS local", () => {
    /*
      Decided from the string and never resolved, so anything that would need a
      DNS lookup to clear is refused. A guard that sometimes takes a network
      round trip is one somebody disables.
    */
    for (const host of ["127.0.0.1.example.com", "notlocalhost", "10.0.0.5"]) {
      expect(check(`mysql://u:p@${host}:3306/x`).ok).toBe(false);
    }
  });

  it("refuses a MISSING url rather than treating it as harmless", () => {
    // "I cannot tell where this points" is not "this points somewhere safe".
    expect(check(undefined).ok).toBe(false);
    expect(check("").ok).toBe(false);
    expect(check("   ").ok).toBe(false);
  });

  it("refuses a url it cannot parse", () => {
    const result = check("not a url at all");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.host).toBeNull();
  });
});

describe("the override is a word, not a truthy flag", () => {
  it("lets a remote database through when it is set exactly", () => {
    const result = check("mysql://u:p@db.example.com:25060/bidrender", {
      [OVERRIDE_VAR]: OVERRIDE_VALUE,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.reason).toBe("override");
  });

  it("accepts it case-insensitively and with stray spaces", () => {
    const result = check("mysql://u:p@db.example.com:25060/bidrender", {
      [OVERRIDE_VAR]: "  YES  ",
    });
    expect(result.ok).toBe(true);
  });

  it("IGNORES a truthy value that is not the word", () => {
    /*
      The point of a word. `=1` or `=true` is the kind of thing that gets left
      exported in a shell from an unrelated task, and a forgotten override is
      this hole with extra steps.
    */
    for (const value of ["1", "true", "y", "on", ""]) {
      const result = check("mysql://u:p@db.example.com:25060/bidrender", {
        [OVERRIDE_VAR]: value,
      });
      expect(result.ok).toBe(false);
    }
  });

  it("does not rescue a url that cannot be read", () => {
    // An override says "yes, the remote one" — not "skip the checks".
    expect(check("not a url", { [OVERRIDE_VAR]: OVERRIDE_VALUE }).ok).toBe(
      false
    );
    expect(check(undefined, { [OVERRIDE_VAR]: OVERRIDE_VALUE }).ok).toBe(false);
  });
});

describe("the exact near-miss that caused this", () => {
  it("refuses the production URL a rehearsal script picked up by accident", () => {
    /*
      2026-09-21: a throwaway script loaded .env.production.local for its R2
      keys, inherited that file's DATABASE_URL, connected to production and
      asked it to DROP a database. It failed only because the app user lacks
      the privilege. This is that moment, as a test.
    */
    const production =
      "mysql://bidrender_app:pw@db-mysql-nyc3-98765.b.db.ondigitalocean.com:25060/bidrender";
    const result = checkWritableDatabase(production, {
      action: "drop and recreate a rehearsal schema",
      env: {},
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // The substance, not the line wrapping: which host, and the way out.
      expect(result.host).toContain("ondigitalocean.com");
      expect(result.message).toContain("ondigitalocean.com");
      expect(result.message).toContain(OVERRIDE_VAR);
      expect(result.message).toContain("drop and recreate a rehearsal schema");
    }
  });
});

describe("the test suite only ever touches a scratch database", () => {
  it("REFUSES the real-data copy that .env points at", () => {
    const result = checkTestDatabase(
      "mysql://root:pw@127.0.0.1:3307/bidrender_local"
    );
    expect(result.ok).toBe(false);
  });

  it("refuses production, even with a test-looking name", () => {
    // The host check is not skipped just because the name looks right.
    const result = checkTestDatabase(
      "mysql://u:p@db.ondigitalocean.com:25060/bidrender_test"
    );
    expect(result.ok).toBe(false);
  });

  it("has no override: ALLOW_REMOTE_DATABASE does not reach it", () => {
    // It takes no env at all, which is the point. Asserted so a later
    // signature change that adds one has to delete this test to do it.
    expect(checkTestDatabase.length).toBe(1);
  });

  it("refuses a name that only CONTAINS the letters", () => {
    for (const name of [
      "contest",
      "bidrender_latest",
      "testimony",
      "bidrender",
    ]) {
      expect(checkTestDatabase(`mysql://u:p@127.0.0.1:3307/${name}`).ok).toBe(
        false
      );
    }
  });

  it("refuses a url it cannot read", () => {
    expect(checkTestDatabase("not a url").ok).toBe(false);
  });

  it("accepts the scratch databases on this machine", () => {
    for (const name of ["bidrender_test", "bidrender_test_clean", "test"]) {
      const result = checkTestDatabase(`mysql://u:p@localhost:3307/${name}`);
      expect(result).toEqual({ ok: true, database: name });
    }
  });

  it("allows no url at all — every database suite skips itself then", () => {
    expect(checkTestDatabase(undefined)).toEqual({ ok: true, database: null });
    expect(checkTestDatabase("  ")).toEqual({ ok: true, database: null });
  });
});
