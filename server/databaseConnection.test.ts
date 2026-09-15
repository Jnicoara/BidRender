/**
 * Connection settings, including the one that decides whether the traffic
 * between this app and the database is readable by anyone in between.
 *
 * No database is touched here: every case is about what mysql2 gets handed.
 */
import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CA_CERT_VAR, mysqlConnection, readCaCert } from "./databaseConnection";

const CERT = [
  "-----BEGIN CERTIFICATE-----",
  "bm90IGEgcmVhbCBjZXJ0aWZpY2F0ZSwganVzdCBzaGFwZWQgbGlrZSBvbmU=",
  "-----END CERTIFICATE-----",
  "",
].join("\n");

/** The same certificate as it often arrives inside a .env file. */
const CERT_ONE_LINE = CERT.split("\n").join(String.raw`\n`);

const LOCAL = "mysql://root:secret@127.0.0.1:3307/bidrender_test";
const MANAGED =
  "mysql://doadmin:secret@db-mysql-nyc3-1.b.db.ondigitalocean.com:25060/defaultdb?ssl-mode=REQUIRED";

const tempDir = mkdtempSync(path.join(tmpdir(), "bidrender-ca-"));
afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe("without a CA certificate", () => {
  it("connects exactly as before, so a local MySQL is unaffected", () => {
    expect(mysqlConnection(LOCAL, {})).toEqual({ uri: LOCAL });
  });

  it("refuses a URL that asks for TLS, and names the missing setting", () => {
    expect(() => mysqlConnection(MANAGED, {})).toThrowError(
      new RegExp(CA_CERT_VAR)
    );
  });

  it("allows a URL that explicitly disables TLS", () => {
    const url = LOCAL + "?ssl-mode=DISABLED";
    const { uri, ssl } = mysqlConnection(url, {});
    expect(ssl).toBeUndefined();
    expect(uri).not.toContain("ssl-mode");
  });

  it("hands back a URL it cannot parse, rather than inventing an error", () => {
    expect(mysqlConnection("not-a-url", {})).toEqual({ uri: "not-a-url" });
  });
});

describe("with a CA certificate", () => {
  it("verifies the server it is talking to", () => {
    const { ssl } = mysqlConnection(MANAGED, { [CA_CERT_VAR]: CERT });
    expect(ssl).toEqual({
      ca: CERT,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    });
  });

  it("drops ssl-mode, which mysql2 would ignore and warn about", () => {
    const { uri } = mysqlConnection(MANAGED, { [CA_CERT_VAR]: CERT });
    expect(uri).not.toContain("ssl-mode");
    expect(uri).toContain("db-mysql-nyc3-1.b.db.ondigitalocean.com:25060");
    expect(uri).toContain("/defaultdb");
  });

  it("restores line breaks written as \\n in an env file", () => {
    const ca = readCaCert({ [CA_CERT_VAR]: CERT_ONE_LINE });
    expect(ca).toBe(CERT);
    expect(ca).not.toContain(String.raw`\n`);
  });

  it("reads the certificate from a file path", () => {
    const file = path.join(tempDir, "ca-certificate.crt");
    writeFileSync(file, CERT, "utf8");
    expect(readCaCert({ [CA_CERT_VAR]: file })).toBe(CERT);
  });

  it("says so when the path cannot be read", () => {
    const missing = path.join(tempDir, "no-such-file.crt");
    expect(() => readCaCert({ [CA_CERT_VAR]: missing })).toThrowError(
      /could not be read/
    );
  });

  it("says so when the value is neither a certificate nor a file", () => {
    expect(() => readCaCert({ [CA_CERT_VAR]: "yes" })).toThrowError(
      /could not be read|does not contain a certificate/
    );
  });

  it("treats a blank setting as no certificate at all", () => {
    expect(readCaCert({ [CA_CERT_VAR]: "   " })).toBeNull();
  });
});
