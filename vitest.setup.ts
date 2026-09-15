/**
 * Environment every test run needs, beyond what `.env` carries.
 *
 * ── Why JWT_SECRET is here ───────────────────────────────────────────────────
 * The repo's `.env` ships DATABASE_URL and nothing else — every way of RUNNING
 * the app supplies the auth variables on the command line (see
 * .claude/skills/run-bidrender/SKILL.md). A test process therefore legitimately
 * starts with no secret.
 *
 * That was harmless until storage URLs began to be signed. `mintStorageToken`
 * refuses to sign with an empty key, deliberately — signing with "" would mint
 * tokens anyone could forge, so failing loudly is the only safe answer — which
 * means any test that reads a plan or a logo URL needs a real secret to exist.
 *
 * Set once here rather than in each suite: five files had to know about it, and
 * the sixth would have been found by a confusing failure rather than by
 * reading. `||=` so a genuinely configured environment always wins and tests
 * never sign with something different from what that environment would.
 */
process.env.JWT_SECRET ||= "test-jwt-secret-not-used-outside-vitest";
