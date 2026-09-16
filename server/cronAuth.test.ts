/**
 * Who may trigger a scheduled job.
 *
 * ── Why this gets its own file, for one small function ───────────────────────
 * The two endpoints behind it delete every expired bid on the system and read
 * every row belonging to every user. There is no session in front of them and
 * no second check behind them — this function is the entire access control.
 *
 * The case that matters most is the boring one: an environment where nobody
 * set the secret. The tempting behaviour there is to let the call through so a
 * fresh deployment "just works", which would leave a database-deleting endpoint
 * open to anyone who knows the URL. That is asserted below before anything else.
 */
import { describe, it, expect } from "vitest";
import {
  CRON_REFUSAL_BODY,
  CRON_SECRET_HEADER,
  MIN_CRON_SECRET_LENGTH,
  checkCronSecret,
} from "./cronAuth";

const SECRET = "a-long-enough-cron-secret-value-0123456789";
const env = (vars: Record<string, string | undefined>): NodeJS.ProcessEnv =>
  vars as NodeJS.ProcessEnv;

describe("letting the scheduler in", () => {
  it("accepts the right secret", () => {
    expect(checkCronSecret(SECRET, env({ CRON_SECRET: SECRET }))).toEqual({
      ok: true,
    });
  });

  it("ignores whitespace around the configured value", () => {
    // A value pasted into a hosting panel picks up a trailing newline more
    // often than not, and an upload that refuses for that reason is a bad
    // evening for whoever has to find it.
    expect(
      checkCronSecret(SECRET, env({ CRON_SECRET: `  ${SECRET}\n` })).ok
    ).toBe(true);
  });
});

describe("keeping everyone else out", () => {
  /**
   * The one that matters. An unconfigured server must refuse, not wave
   * everything through — otherwise every environment where the variable was
   * missed has an open endpoint that deletes bids.
   */
  it("refuses everything when no secret is set", () => {
    expect(checkCronSecret(SECRET, env({}))).toEqual({
      ok: false,
      reason: "not-configured",
    });
    expect(checkCronSecret(undefined, env({})).ok).toBe(false);
    // And an empty header does not match an empty setting.
    expect(checkCronSecret("", env({ CRON_SECRET: "" })).ok).toBe(false);
  });

  it("refuses a secret short enough to guess", () => {
    // Set to something like "changeme", this would otherwise look configured.
    const short = "x".repeat(MIN_CRON_SECRET_LENGTH - 1);
    expect(checkCronSecret(short, env({ CRON_SECRET: short }))).toEqual({
      ok: false,
      reason: "secret-too-short",
    });
  });

  it("refuses a missing header", () => {
    expect(checkCronSecret(undefined, env({ CRON_SECRET: SECRET }))).toEqual({
      ok: false,
      reason: "missing-header",
    });
    expect(checkCronSecret("", env({ CRON_SECRET: SECRET })).ok).toBe(false);
  });

  it("refuses the wrong secret", () => {
    expect(
      checkCronSecret(
        "not-the-secret-but-long-enough-to-pass",
        env({ CRON_SECRET: SECRET })
      )
    ).toEqual({ ok: false, reason: "wrong-secret" });
  });

  /**
   * The near-miss cases a prefix comparison would get wrong. Each of these
   * shares most of the secret with the real one.
   */
  it("refuses a secret that is nearly right", () => {
    for (const nearly of [
      SECRET.slice(0, -1), // one character short
      `${SECRET}x`, // one character long
      `${SECRET.slice(0, -1)}X`, // last character wrong
      SECRET.toUpperCase(), // case changed
      ` ${SECRET}`, // leading space
    ]) {
      expect(
        checkCronSecret(nearly, env({ CRON_SECRET: SECRET })).ok,
        `should refuse ${JSON.stringify(nearly)}`
      ).toBe(false);
    }
  });

  /**
   * A repeated header arrives as an array. Express would hand over both values;
   * picking one would let a caller send a guess alongside a blank and have the
   * lenient branch decide. A caller sending two different values is not a
   * caller to be helpful to.
   */
  it("refuses a header sent twice", () => {
    expect(
      checkCronSecret([SECRET, "something else"], env({ CRON_SECRET: SECRET }))
        .ok
    ).toBe(false);
  });
});

describe("what the caller is told", () => {
  /**
   * Every refusal says the same thing. Distinguishing "no secret configured"
   * from "wrong secret" in the response would let someone learn whether the
   * endpoint is protected at all without ever guessing correctly.
   */
  it("gives one message for every kind of refusal", () => {
    expect(CRON_REFUSAL_BODY).toEqual({ error: "not authorised" });
    expect(JSON.stringify(CRON_REFUSAL_BODY)).not.toMatch(
      /secret|config|header|length/i
    );
  });

  it("names the header in lower case, as node delivers it", () => {
    // Node lower-cases incoming header names. Looking up "X-Cron-Secret" on
    // req.headers finds nothing, silently, and every trigger is refused.
    expect(CRON_SECRET_HEADER).toBe(CRON_SECRET_HEADER.toLowerCase());
  });
});
