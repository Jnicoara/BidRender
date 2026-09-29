/**
 * Time the real `getLibraryMaterials` for one company and print what it cost,
 * as one line of JSON. Read-only.
 *
 * Run by `server/catalogScale.test.ts`, in a CHILD process pointed at a
 * scratch database that test builds and drops. A child, because `getDb`
 * reads `DATABASE_URL` once per process: changing it inside the test runner
 * would leak into whichever test file that worker runs next. And a scratch
 * database, because padding the shared test database to 3,000 rows races
 * `server/backup.test.ts`, which dumps and counts every table (todo.md,
 * "Flaky tests").
 *
 *   DATABASE_URL=mysql://…/bidrender_catalogscale_test \
 *     pnpm tsx scripts/catalogLoadProbe.mts <companyId>
 */
import zlib from "node:zlib";
import superjson from "superjson";
import { getLibraryMaterials } from "../server/db";

const company = Number(process.argv[2]);
if (!process.env.DATABASE_URL || !Number.isInteger(company)) {
  console.error("usage: DATABASE_URL=… catalogLoadProbe.mts <companyId>");
  process.exit(2);
}

await getLibraryMaterials(company); // open the pool, warm the query
const readMs: number[] = [];
let library: Awaited<ReturnType<typeof getLibraryMaterials>> = [];
for (let i = 0; i < 3; i++) {
  const start = performance.now();
  library = await getLibraryMaterials(company);
  readMs.push(performance.now() - start);
}

// What materials.list sends (the tRPC transformer is superjson), and what the
// browser then does with it on arrival.
const body = superjson.stringify(library);
const parseStart = performance.now();
const revived = superjson.parse<unknown[]>(body);
const parseMs = performance.now() - parseStart;

console.log(
  JSON.stringify({
    rows: library.length,
    revivedRows: revived.length,
    readMs: readMs.sort((a, b) => a - b)[1],
    bytes: Buffer.byteLength(body),
    gzippedBytes: zlib.gzipSync(body).length,
    parseMs,
  })
);
// The pool would hold the process open.
process.exit(0);
