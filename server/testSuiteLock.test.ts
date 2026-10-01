/**
 * The run holds its test database for as long as it runs.
 *
 * Checked from INSIDE the run on purpose: the thing that matters is not that
 * `holdTestSuiteLock` works when called, but that vitest.globalSetup.ts really
 * called it and the lock is still held while test files execute. Delete the
 * call from globalSetup and the first case goes red — the lock is free.
 *
 * Why the lock exists is in scripts/testSuiteLock.ts: two runs on one database
 * deleted each other's fixtures (seedReactivatesRetired, backup).
 */
import { describe, it, expect } from "vitest";
import mysql from "mysql2/promise";
import { holdTestSuiteLock, testSuiteLockName } from "../scripts/testSuiteLock";

const databaseUrl = process.env.DATABASE_URL ?? "";
const hasDb = Boolean(databaseUrl);

describe.skipIf(!hasDb)("one test run per database", () => {
  it("is held by this run while its files execute", async () => {
    const connection = await mysql.createConnection({ uri: databaseUrl });
    try {
      const [dbRow] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT DATABASE() AS db"
      );
      const name = testSuiteLockName(dbRow[0].db as string);
      const [rows] = await connection.query<mysql.RowDataPacket[]>(
        "SELECT IS_USED_LOCK(?) AS holder, CONNECTION_ID() AS me",
        [name]
      );
      expect(rows[0].holder, "nobody holds this run's database").not.toBeNull();
      expect(rows[0].holder).not.toBe(rows[0].me);
    } finally {
      await connection.end();
    }
  });

  it("refuses a second run on the same database, naming it", async () => {
    await expect(holdTestSuiteLock(databaseUrl)).rejects.toThrow(
      /another test run is using/
    );
  });

  it("leaves another database free", async () => {
    // Two runs on two databases share no fixtures, so they may run together.
    expect(testSuiteLockName("bidrender_test_b")).not.toBe(
      testSuiteLockName("bidrender_test_c")
    );
  });
});
