/**
 * Make, or repair, the STARTER EDITOR: the master account that edits the
 * shipped starter (references/baseline-screen-plan.md § 1). Track A runs it.
 * The ONLY way the account comes to exist — signup cannot make it, and no
 * route sets users.role.
 *
 *   pnpm tsx scripts/createStarterEditor.mts --email <addr> --name "<name>"
 *   pnpm tsx scripts/createStarterEditor.mts --reset-2fa --email <addr>
 *   pnpm tsx scripts/createStarterEditor.mts --reset-password --email <addr>
 *
 * A database that is not on this machine needs ALLOW_REMOTE_DATABASE=yes
 * (scripts/databaseGuard.ts). STARTER_TOTP_KEY must be the SAME value the
 * server it signs in to has — the secret is sealed with it.
 *
 * ── What it prints, once ─────────────────────────────────────────────────────
 * Create: a generated password, the QR code to scan with an authenticator app
 * (and the secret, for typing in by hand), and ten recovery codes.
 * --reset-2fa: a new QR code and ten new codes; the old ones stop working and
 * every session ends. --reset-password: a new generated password; every
 * session ends.
 *
 * NOTHING here is written to a file, on purpose: each of these is a
 * credential. Run it in a terminal nobody is recording, and store the
 * recovery codes somewhere other than the phone.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import QRCode from "qrcode";
import { assertWritableDatabase } from "./databaseGuard";
import { starterKey } from "../server/starterEditor/secretBox";
import { otpauthUri } from "../server/starterEditor/totp";
import {
  createStarterEditor,
  resetStarterEditorFactor,
  resetStarterEditorPassword,
} from "../server/starterEditor/store";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const email = arg("--email")?.trim().toLowerCase();
const resetTwoFactor = process.argv.includes("--reset-2fa");
const resetPassword = process.argv.includes("--reset-password");
if (!email || (resetTwoFactor && resetPassword)) {
  console.error(
    'Usage: --email <addr> --name "<name>" | --reset-2fa --email <addr> | --reset-password --email <addr>'
  );
  process.exit(1);
}

assertWritableDatabase(process.env.DATABASE_URL, {
  action: resetTwoFactor
    ? "reset the starter editor's authenticator"
    : resetPassword
      ? "reset the starter editor's password"
      : "create the starter editor account",
});

/** 24 characters from 54: about 138 bits, no lookalikes. */
function generatedPassword(): string {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(randomBytes(24), b => alphabet[b % alphabet.length]).join(
    ""
  );
}

async function printFactor(secret: string, codes: string[]) {
  const uri = otpauthUri(secret, email!);
  console.log("\nScan this with the authenticator app:\n");
  console.log(await QRCode.toString(uri, { type: "terminal", small: true }));
  console.log(
    `Or type the secret by hand: ${secret.match(/.{1,4}/g)!.join(" ")}`
  );
  console.log("\nRecovery codes — each works once. Keep them OFF the phone:\n");
  for (const code of codes) console.log(`  ${code}`);
  console.log(
    "\nThe first code accepted at sign-in completes enrollment. Nothing above is stored anywhere readable."
  );
}

const key = starterKey();

if (resetTwoFactor) {
  const fresh = await resetStarterEditorFactor(email, key);
  console.log(
    `Authenticator reset for account ${fresh.userId}; every session ended.`
  );
  await printFactor(fresh.totpSecret, fresh.recoveryCodes);
} else if (resetPassword) {
  const password = generatedPassword();
  await resetStarterEditorPassword(email, password);
  console.log(`New password (shown once): ${password}`);
  console.log("Every session ended.");
} else {
  const name = arg("--name")?.trim() || "Starter editor";
  const password = generatedPassword();
  const made = await createStarterEditor({ email, name, password }, key);
  console.log(`Starter editor created: account ${made.userId}, ${email}`);
  console.log(`Password (shown once): ${password}`);
  await printFactor(made.totpSecret, made.recoveryCodes);
}
process.exit(0);
