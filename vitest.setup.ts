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

/**
 * ── The AI environment is decided HERE, not by whoever's `.env` this is ──────
 *
 * Unconditional, unlike `JWT_SECRET` above, and the difference is the point: a
 * suite's environment must not be inherited from a developer's local
 * preferences. `.env` carries `DISABLE_AI_FEATURES=true`, which is right for a
 * dev server and wrong for a test run — the routers refuse at the gate, 23
 * tests in `planCopilot` and `navigation` fail before reaching the mocks they
 * are built around, and that has been the standing "known baseline" for long
 * enough to be indistinguishable from a regression somebody just caused.
 *
 * The ritual it replaces was three commands in todo.md: flip the flag in
 * `.env`, run, flip it back. A check that has to be remembered, performed and
 * then undone is a check nobody performs — and the undo is the dangerous step,
 * because forgetting it leaves a dev server able to spend money.
 *
 * A test that wants the disabled path sets the variable itself and restores it.
 * `aiFeaturesEnabled()` reads `process.env` at CALL time, not at import, which
 * is what makes that work.
 */
process.env.DISABLE_AI_FEATURES = "false";

/**
 * ── And with AI on, nothing may reach a real model ───────────────────────────
 *
 * Belt to the braces above. Every AI suite mocks its way out today —
 * `planCopilot` and `navigation` mock `./llm`, `anthropicRequest` mocks the SDK
 * and supplies its own fake key in a `beforeEach`, `anthropicAdapter` only ever
 * calls `invokeAnthropic` in cases that reject before a request is built, and
 * the two `*Model` suites are pure functions. So this is safe today and
 * changes nothing.
 *
 * It is here for the day it stops being true. `.env` has no `ANTHROPIC_API_KEY`
 * now; the moment somebody adds one for local work, a suite that forgets a mock
 * would spend real money on every run — which breaks the first standing rule in
 * CLAUDE.md's AI section, that nothing spends an AI call the user did not ask
 * for. A missing key makes that failure loud and free instead of quiet and
 * billed, and it costs one line.
 *
 * Blanked rather than deleted so the shape stays a string: code that reads it
 * expects one, and `undefined` finds a different branch than "".
 */
process.env.ANTHROPIC_API_KEY = "";
