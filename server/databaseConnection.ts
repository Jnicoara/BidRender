/**
 * How this process opens a MySQL connection — in one place, for every caller.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The app, the migration runner and the three backup helpers each built their
 * own connection from `DATABASE_URL` alone. That is fine against a database on
 * the same machine and wrong against a managed one: DigitalOcean (and most
 * hosts) refuse an unencrypted connection, and their certificate is signed by
 * their own authority rather than one Node already trusts.
 *
 * ── Encrypted AND verified, or not encrypted at all ──────────────────────────
 * There is a tempting shortcut — `rejectUnauthorized: false` — which encrypts
 * the traffic but skips checking WHO answered. That is the half of TLS that
 * stops someone standing in the middle of the connection reading every bid and
 * every password hash on the way past, so it is not offered here. Either a CA
 * certificate is configured and the server is verified against it, or no TLS is
 * requested at all (a local MySQL on this machine, which is the default).
 *
 * ── `ssl-mode` in the URL is removed, deliberately ───────────────────────────
 * DigitalOcean hands out a URL ending `?ssl-mode=REQUIRED`. mysql2 does not
 * understand that parameter: it prints "Ignoring invalid configuration option"
 * and connects WITHOUT encryption, which the server then refuses — an error
 * that says nothing about the real cause. So the parameter is stripped and
 * answered properly: with a certificate the connection is encrypted and
 * verified; without one, a URL that asks for TLS fails immediately and says
 * which setting is missing, rather than failing later and blaming the network.
 */
import { readFileSync } from "node:fs";

/** The setting that holds DigitalOcean's CA certificate. */
export const CA_CERT_VAR = "DATABASE_CA_CERT";

/** Every certificate in PEM form starts with this line. */
const PEM_MARKER = "-----BEGIN CERTIFICATE-----";

/** URL parameters that mean "encrypt this connection". */
const SSL_MODE_PARAMS = ["ssl-mode", "sslmode", "ssl_mode"];

/** ssl-mode values that require TLS. DISABLED and PREFERRED do not. */
const MODES_REQUIRING_TLS = new Set([
  "REQUIRED",
  "VERIFY_CA",
  "VERIFY_IDENTITY",
]);

/** What mysql2 is handed for a verified connection. */
export type MysqlSslOptions = {
  ca: string;
  rejectUnauthorized: true;
  minVersion: "TLSv1.2";
};

/** The connection settings every caller passes to mysql2. */
export type MysqlConnectionOptions = {
  uri: string;
  ssl?: MysqlSslOptions;
};

/**
 * The CA certificate, or null when none is configured.
 *
 * `DATABASE_CA_CERT` holds either the certificate text itself — which is what
 * DigitalOcean's control panel gives you, and what goes in an environment
 * variable on the host — or the path to the downloaded `.crt` file. The two are
 * told apart by the certificate's own first line, so there is nothing to
 * configure about which one you used.
 *
 * A value pasted into a `.env` file often arrives with its line breaks written
 * as the two characters backslash-n; those are turned back into real line
 * breaks, because OpenSSL will not read the certificate otherwise.
 */
export function readCaCert(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const raw = env[CA_CERT_VAR]?.trim();
  if (!raw) return null;

  const text = raw.includes(PEM_MARKER)
    ? raw.split(String.raw`\n`).join("\n")
    : readCertFile(raw);

  if (!text.includes(PEM_MARKER)) {
    throw new Error(
      `${CA_CERT_VAR} is set but does not contain a certificate. It must be either the certificate text (starting "${PEM_MARKER}") or the path to the .crt file downloaded from your database host.`
    );
  }
  // Always ends with a newline. Trimming the setting's value above can eat the
  // one the downloaded file ended with, and a PEM whose last line is not
  // terminated is rejected by some readers.
  return text.endsWith("\n") ? text : `${text}\n`;
}

function readCertFile(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `${CA_CERT_VAR} looks like a file path, but ${path} could not be read: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Connection settings for one database URL.
 *
 * Pass the result straight to `mysql.createConnection` / `createPool`, spreading
 * any extra options the caller needs alongside it.
 *
 * With no certificate configured this is just the URL, so a local MySQL keeps
 * connecting exactly as it did before.
 */
export function mysqlConnection(
  databaseUrl: string,
  env: NodeJS.ProcessEnv = process.env
): MysqlConnectionOptions {
  const { uri, sslMode } = withoutSslMode(databaseUrl);
  const ca = readCaCert(env);

  if (!ca) {
    if (sslMode && MODES_REQUIRING_TLS.has(sslMode)) {
      throw new Error(
        `This database URL asks for an encrypted connection (ssl-mode=${sslMode}), but ${CA_CERT_VAR} is not set. Download the CA certificate from your database host and put it in ${CA_CERT_VAR} — either the certificate text or the path to the .crt file. See references/environment.md.`
      );
    }
    return { uri };
  }

  return {
    uri,
    // rejectUnauthorized is what actually checks the server's identity against
    // the certificate above. It is the point of the exercise; never relax it.
    ssl: { ca, rejectUnauthorized: true, minVersion: "TLSv1.2" },
  };
}

/**
 * The URL with any `ssl-mode` parameter removed, plus what it said.
 *
 * A URL mysql2 could not parse is handed back untouched: reporting that is the
 * driver's job, and it gives a better message than anything invented here.
 */
function withoutSslMode(databaseUrl: string): {
  uri: string;
  sslMode: string | null;
} {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    return { uri: databaseUrl, sslMode: null };
  }

  let sslMode: string | null = null;
  for (const param of SSL_MODE_PARAMS) {
    const value = url.searchParams.get(param);
    if (value !== null) {
      sslMode = value.trim().toUpperCase();
      url.searchParams.delete(param);
    }
  }

  return { uri: url.toString(), sslMode };
}
