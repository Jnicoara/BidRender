/**
 * `pnpm dev`, with files going to the Cloudflare R2 plan bucket.
 *
 * Identical to the ordinary dev server in every other way: `.env` still
 * supplies the laptop database and JWT_SECRET, Vite still runs as middleware,
 * the watch still reloads. The only differences are PLAN_STORAGE=r2 and the
 * five R2_PLANS_* credentials, which are lent to the child process by
 * loadPlansEnv.mts and never written anywhere.
 *
 * PLAN_STORAGE=r2 is what makes this beat `.env`'s LOCAL_STORAGE_DIR: the
 * backend is chosen by name, so an explicit setting always wins over an
 * inferred one. That is the whole reason the switch is a name and not a guess.
 *
 * Usage:  pnpm dev:r2
 */
import { spawn } from "node:child_process";
import { loadPlansEnv } from "./loadPlansEnv.mjs";

const plans = loadPlansEnv();
const names = Object.keys(plans).sort();

console.log(
  `[dev:r2] plan files → R2 bucket ${plans.R2_PLANS_BUCKET ?? "(unnamed)"}`
);
console.log(`[dev:r2] lent from .env.production.local: ${names.join(", ")}`);
console.log("[dev:r2] everything else in that file was ignored.\n");

// Through `pnpm exec` rather than resolving tsx's entry file by path: the
// layout inside node_modules is pnpm's business and has changed before, and a
// dev script that breaks on a dependency bump is a dev script nobody trusts.
// shell:true because on Windows `pnpm` is a .cmd and spawn will not run one.
// One string rather than an args array: with shell:true Node concatenates the
// two anyway and warns about it (DEP0190). There is nothing user-supplied in
// this command, so writing it out is both honest and quiet.
const child = spawn("pnpm exec tsx watch server/_core/index.ts", {
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    ...plans,
    NODE_ENV: "development",
    PLAN_STORAGE: "r2",
  },
});

child.on("exit", code => process.exit(code ?? 0));
