/**
 * What is allowed out of `.env.production.local`, and what must never be.
 *
 * ── Why this filter is worth a test of its own ───────────────────────────────
 * That file holds the LIVE database URL. `pnpm dev` does not load it, and that
 * gap is a safety feature: no local run can point itself at production by
 * accident. `pnpm dev:r2` needs five values out of that file and must not
 * widen the gap while taking them.
 *
 * The failure this guards against is silent and expensive. A loader that let
 * DATABASE_URL through would hand a watching dev server the production
 * database, and everything would look normal — right up until a test bid, a
 * deleted material or a seeded catalog landed in real customer data.
 *
 * So the rule is a prefix allow-list, and the cases below are mostly proof of
 * what does NOT come out.
 */
import { describe, it, expect } from "vitest";
import { pickPlansVars } from "./loadPlansEnv.mjs";

/** A realistic file: the plan vars are the minority of what is in there. */
const FILE = `
# Production backup credentials — LOCAL ONLY, never committed.
DATABASE_URL=mysql://live:pa55w0rd@db.example.com:3306/bidrender

BUILT_IN_FORGE_API_URL=https://forge.example.com
BUILT_IN_FORGE_API_KEY=forge-secret

R2_ACCOUNT_ID=backup-acct
R2_ACCESS_KEY_ID=backup-key
R2_SECRET_ACCESS_KEY=backup-secret
R2_BUCKET=bidsoftware
# R2_BACKUP_PREFIX=helixbid

R2_PLANS_ACCOUNT_ID=plans-acct
R2_PLANS_ACCESS_KEY_ID=plans-key
R2_PLANS_SECRET_ACCESS_KEY=plans-secret
R2_PLANS_BUCKET=bidrender-plans
R2_PLANS_ENDPOINT=https://plans-acct.r2.cloudflarestorage.com
`;

describe("what comes out of the production env file", () => {
  it("takes the five plan-bucket values", () => {
    expect(pickPlansVars(FILE)).toEqual({
      R2_PLANS_ACCOUNT_ID: "plans-acct",
      R2_PLANS_ACCESS_KEY_ID: "plans-key",
      R2_PLANS_SECRET_ACCESS_KEY: "plans-secret",
      R2_PLANS_BUCKET: "bidrender-plans",
      R2_PLANS_ENDPOINT: "https://plans-acct.r2.cloudflarestorage.com",
    });
  });

  /** The one that matters most. */
  it("never lets the live database URL out", () => {
    const picked = pickPlansVars(FILE);
    expect(picked).not.toHaveProperty("DATABASE_URL");
    expect(JSON.stringify(picked)).not.toContain("db.example.com");
  });

  it("leaves the backup bucket's credentials behind", () => {
    // R2_* is a different bucket and a different token from R2_PLANS_*. A
    // prefix match on "R2_" rather than "R2_PLANS_" would take both, which is
    // exactly the mistake that re-joins the plan store to the backups.
    const picked = pickPlansVars(FILE);
    for (const name of [
      "R2_ACCOUNT_ID",
      "R2_ACCESS_KEY_ID",
      "R2_SECRET_ACCESS_KEY",
      "R2_BUCKET",
    ]) {
      expect(picked).not.toHaveProperty(name);
    }
    expect(JSON.stringify(picked)).not.toContain("bidsoftware");
  });

  it("leaves the Forge keys behind", () => {
    const picked = pickPlansVars(FILE);
    expect(JSON.stringify(picked)).not.toContain("forge-secret");
  });

  it("filters by name, so re-ordering the file changes nothing", () => {
    const reversed = FILE.split("\n").reverse().join("\n");
    expect(pickPlansVars(reversed)).toEqual(pickPlansVars(FILE));
  });
});

describe("reading the lines themselves", () => {
  it("ignores comments, including a commented-out plan variable", () => {
    expect(pickPlansVars("# R2_PLANS_BUCKET=ghost")).toEqual({});
  });

  it("skips a variable with no value", () => {
    // A half-filled file must read as unconfigured, not as configured with "".
    expect(pickPlansVars("R2_PLANS_BUCKET=\nR2_PLANS_ACCOUNT_ID=  ")).toEqual(
      {}
    );
  });

  it("strips quotes a pasted secret often arrives in", () => {
    expect(pickPlansVars(`R2_PLANS_BUCKET="bidrender-plans"`)).toEqual({
      R2_PLANS_BUCKET: "bidrender-plans",
    });
    expect(pickPlansVars(`R2_PLANS_BUCKET='bidrender-plans'`)).toEqual({
      R2_PLANS_BUCKET: "bidrender-plans",
    });
  });

  it("keeps an = inside a value", () => {
    expect(pickPlansVars("R2_PLANS_SECRET_ACCESS_KEY=ab=cd==")).toEqual({
      R2_PLANS_SECRET_ACCESS_KEY: "ab=cd==",
    });
  });

  it("reads a file with Windows line endings", () => {
    expect(
      pickPlansVars("R2_PLANS_BUCKET=b\r\nR2_PLANS_ACCOUNT_ID=a\r\n")
    ).toEqual({ R2_PLANS_BUCKET: "b", R2_PLANS_ACCOUNT_ID: "a" });
  });
});
