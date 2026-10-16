/**
 * ONE-OFF RELEASE STEP (references/next-live-release-plan.md, "Night prep
 * 2026-10-14"): remove the empty companies the signup race made for one
 * owner. Owner's yes required; backup first.
 *
 *   pnpm tsx scripts/removeRaceCompanies.mts --owner 3036
 *       dry run: lists the kept company and every candidate with its checks
 *   pnpm tsx scripts/removeRaceCompanies.mts --owner 3036 --apply --expect 5,6,7,8
 *       removes exactly those, or nothing
 *
 * `--expect` is required with `--apply`, and must equal the removable list
 * found at that moment — so the ids the owner read in the dry run are the
 * only ids that can go. Logic and checks: server/raceCompanies.ts.
 *
 * Writes only with --apply, and then through the usual guard (a database not
 * on this machine needs ALLOW_REMOTE_DATABASE=yes).
 */
import "dotenv/config";
import {
  checkRaceCompanies,
  removeRaceCompanies,
} from "../server/raceCompanies";
import { assertWritableDatabase } from "./databaseGuard";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const owner = Number(arg("--owner"));
if (!Number.isInteger(owner) || owner <= 0)
  throw new Error("--owner <userId> is required");
const apply = process.argv.includes("--apply");
const expect = (arg("--expect") ?? "")
  .split(",")
  .map(s => s.trim())
  .filter(Boolean)
  .map(Number);
if (apply && (expect.length === 0 || expect.some(n => !Number.isInteger(n))))
  throw new Error("--apply needs --expect <id,id,...> from the dry run");
if (apply)
  assertWritableDatabase(process.env.DATABASE_URL, {
    action: `remove signup-race companies of user ${owner}`,
  });

const { kept, candidates } = await checkRaceCompanies(owner);
console.log(`${apply ? "APPLY" : "DRY RUN"}: owner ${owner}`);
console.log(
  `  kept (lowest id, where they work): ${kept ?? "none — owns no company"}`
);
for (const c of candidates)
  console.log(
    `  company ${c.companyId}: ${c.removable ? "REMOVABLE (only its owner membership)" : "KEEP — " + c.reasons.join("; ")}`
  );
const removable = candidates.filter(c => c.removable).map(c => c.companyId);
console.log(`  removable: [${removable.join(", ")}]`);

if (apply) {
  const { removed } = await removeRaceCompanies(owner, expect);
  const after = await checkRaceCompanies(owner);
  console.log(`  removed: [${removed.join(", ")}]`);
  console.log(
    `  after: kept ${after.kept}, other companies owned: ${after.candidates.length}`
  );
}
process.exit(0);
