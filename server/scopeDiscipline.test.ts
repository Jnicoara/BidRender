/**
 * The rule that cannot be enforced by types: every data route is scoped.
 *
 * ── Why this test exists at all ──────────────────────────────────────────────
 * `ctx.user.id` and `ctx.scope.dataUserId` are both numbers. Using the wrong
 * one compiles, passes every unit test written against a single-user fixture,
 * and produces a member who silently sees an empty app — or, for a route that
 * looks a row up by id and then filters, a member who sees nothing while
 * believing the bid is gone. No type can tell them apart, and no reviewer
 * reliably catches the 411th occurrence.
 *
 * So this reads the source. It is a lint rule that happens to live in the test
 * suite, and it is deliberately about SHAPE rather than behaviour: behaviour
 * tests prove the routes that exist are correct, and this one proves that the
 * next route somebody adds cannot quietly be wrong.
 *
 * ── The allowlists are the interesting part ──────────────────────────────────
 * Both lists below are exhaustive and both require a reason. Adding a file to
 * one is a deliberate act with a comment attached, which is the entire point:
 * the default is scoped, and the exceptions are visible.
 */
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROUTERS = resolve(import.meta.dirname, "routers");

const files = readdirSync(ROUTERS).filter(f => f.endsWith("Router.ts"));
const read = (file: string) => readFileSync(resolve(ROUTERS, file), "utf8");

/**
 * Routers allowed to use `ctx.user.id` — the ACTOR's id rather than the
 * company's data scope. Each one is about the person, not their company's data.
 */
const ACTOR_SCOPED: Record<string, string> = {
  "authRouter.ts":
    "Reads and writes the signed-in person's own profile row. The actor IS the subject.",
  "onboardingRouter.ts":
    "First-run and checklist flags live on the user, not the company — two people in one company each dismiss their own. The checklist FACTS it reads are company-scoped; see the file.",
  "companyRouter.ts":
    "Membership administration. Acts on people by id within ctx.scope.companyId, and never uses an id to scope DATA.",
};

/**
 * Routers allowed to use bare `protectedProcedure` — no capability gate.
 * Everything that touches a contractor's data must use `scoped(...)` or
 * `internalProcedure(...)` instead.
 */
const UNGATED: Record<string, string> = {
  "authRouter.ts":
    "Identity. Gating it behind a company role would lock a new user out of their own account.",
  "earlyAccessRouter.ts":
    "A public marketing signup; it has no user data to scope.",
  "navigationRouter.ts":
    "Sends a question to an LLM and returns a route id. Reads nothing.",
  "companyRouter.ts":
    "Uses companyProcedure and requireCapability explicitly; see the file header.",
  "onboardingRouter.ts":
    'Per-person first-run and checklist state, which every member has whatever their role. The one route that writes COMPANY data — setStarterRate — carries requireCapability("pricing.edit") explicitly.',
};

/**
 * Routers gated by `adminProcedure` alone — platform staff, not company roles.
 *
 * A stricter gate than any capability, so these need no company scoping. Listed
 * rather than inferred: "this file happens to contain adminProcedure" would
 * pass a router that used it on one route and left the rest open.
 */
const ADMIN_ONLY: Record<string, string> = {
  "backupRouter.ts":
    "Runs and reports the platform-wide R2 backup. Not a contractor's data at all.",
  "aiUsageRouter.ts":
    "Reports AI spend across every account, so seeing it is seeing across companies. It reads only counts and money — never a prompt, a question or a reply — so there is no contractor data here to scope.",
};

describe("every data router is company-scoped", () => {
  it("has routers to check at all", () => {
    // Guards against the whole suite passing because a path went stale.
    expect(files.length).toBeGreaterThan(20);
  });

  it("uses ctx.scope.dataUserId, not ctx.user.id, to scope data", () => {
    const offenders = files.filter(
      file => !ACTOR_SCOPED[file] && read(file).includes("ctx.user.id")
    );
    expect({
      offenders,
      hint: "Use ctx.scope.dataUserId. If this route really is about the signed-in person rather than their company's data, add it to ACTOR_SCOPED with a reason.",
    }).toEqual({ offenders: [], hint: expect.anything() });
  });

  it("puts a capability gate on every data router", () => {
    const offenders = files.filter(
      file => !UNGATED[file] && /\bprotectedProcedure\b/.test(read(file))
    );
    expect({
      offenders,
      hint: "Use scoped(view, edit) or internalProcedure(feature, capability). If this route genuinely needs no company role, add it to UNGATED with a reason.",
    }).toEqual({ offenders: [], hint: expect.anything() });
  });

  it("scopes every gated router with a real capability pair", () => {
    for (const file of files) {
      const src = read(file);
      if (UNGATED[file]) continue;
      if (ADMIN_ONLY[file]) {
        // Admin-gated routers must use ONLY adminProcedure — a mixed router
        // would have unguarded routes hiding behind this exemption.
        expect({
          file,
          mixed: /\b(protectedProcedure|companyProcedure)\b/.test(src),
        }).toEqual({ file, mixed: false });
        continue;
      }
      const gated =
        /scoped\(\s*"[a-z.]+"\s*,\s*"[a-z.]+"\s*\)/.test(src) ||
        /internalProcedure\(\s*"[a-z.]+"/.test(src);
      expect({ file, gated }).toEqual({ file, gated: true });
    }
  });

  it("keeps the allowlists honest — no entry for a file that no longer exists", () => {
    for (const file of [
      ...Object.keys(ACTOR_SCOPED),
      ...Object.keys(UNGATED),
      ...Object.keys(ADMIN_ONLY),
    ]) {
      expect({ file, present: files.includes(file) }).toEqual({
        file,
        present: true,
      });
    }
  });

  /**
   * Routes allowed to accept a company id from the caller.
   *
   * Exactly one, and it re-checks membership before honouring it. Everywhere
   * else this parameter would turn every capability check into theatre: a
   * member could name someone else's company and be authorised against their
   * own role in their own.
   */
  const TAKES_COMPANY_ID: Record<string, string> = {
    "companyRouter.ts":
      "switchCompany, which re-reads the membership and refuses an id the actor cannot reach. Every later request re-resolves the scope anyway, so this is a convenience check, not the guard.",
  };

  it("never lets a route take a company id from the caller", () => {
    for (const file of files) {
      if (TAKES_COMPANY_ID[file]) continue;
      const src = read(file);
      const takesCompanyId = /companyId:\s*z\./.test(src);
      expect({ file, takesCompanyId }).toEqual({ file, takesCompanyId: false });
    }
  });

  it("makes the one company-id route re-check membership", () => {
    // The exemption above is only safe because of this line. If someone
    // removes the check, the exemption becomes a bypass.
    const src = read("companyRouter.ts");
    expect(src).toMatch(/getMembership\(\s*input\.companyId/);
  });
});
