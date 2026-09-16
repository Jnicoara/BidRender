/**
 * One real call per AI feature, against Anthropic, with the real cost printed.
 *
 * Exists because "it typechecks and the adapter's unit tests pass" is not the
 * same as "a 3MB drawing reaches the model and comes back parsed". Everything
 * this exercises — the key, the message translation, the image split, the tool
 * round-trip, the limit, the cost line and the usage row — only runs together
 * for the first time when a real call is made.
 *
 * Borrows ONLY ANTHROPIC_API_KEY out of .env.production.local, by name, the
 * same way scripts/loadPlansEnv.mts borrows the plan-bucket credentials: that
 * file also holds the live database URL, and nothing here should be able to
 * reach it.
 *
 * Usage:  pnpm tsx scripts/aiSmokeTest.mts
 */
// .env first: the local database, which the daily-limit counter lives in.
// Note what happens without it — the limit check cannot read the counter and
// every call is REFUSED. That is the intended direction: a limit that fails
// open is not a limit.
import "dotenv/config";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

// ── Borrow the key, and nothing else ────────────────────────────────────────
const envText = readFileSync(".env.production.local", "utf8");
for (const raw of envText.split(/\r?\n/)) {
  const line = raw.trim();
  if (!line || line.startsWith("#")) continue;
  const eq = line.indexOf("=");
  if (eq <= 0) continue;
  const name = line.slice(0, eq).trim();
  if (name !== "ANTHROPIC_API_KEY") continue;
  const value = line
    .slice(eq + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, "$2");
  if (value) process.env.ANTHROPIC_API_KEY = value;
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set in .env.production.local.");
  process.exit(1);
}
// The features are gated on this, and .env sets it for local work.
process.env.DISABLE_AI_FEATURES = "false";

const { invokeLLM } = await import("../server/llm/index");
const { PLAN_COPILOT_MODEL } = await import(
  "../server/routers/planCopilotRouter"
);
const { NAVIGATION_MODEL } = await import("../server/routers/navigationRouter");
const { MATERIAL_ALIAS_MODEL } = await import(
  "../server/routers/materialsRouter"
);
const { costMicros, formatMicros } = await import("../shared/aiPricing");
const { aliasPromptFor } = await import("../shared/aliasSuggestions");

/**
 * A PNG of realistic sheet dimensions.
 *
 * Anthropic charges an image at roughly (width × height) / 750 tokens, so the
 * SIZE is what the cost depends on — the content does not change the bill.
 * This is grey noise at 1400×1000, which bills like a rasterised drawing
 * without needing a PDF renderer in node. Whether the model can READ a real
 * drawing is a different question, and the accuracy eval is where it belongs.
 */
function syntheticSheetPng(width = 1400, height = 1000): string {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let p = 0;
  for (let y = 0; y < height; y++) {
    raw[p++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const v = (x * 7 + y * 13) % 256;
      raw[p++] = v;
      raw[p++] = v;
      raw[p++] = v;
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crcTable: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const byte of body) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([len, body, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** A user id that exists, so the usage row's foreign key holds. */
const USER = Number(process.env.SMOKE_USER_ID ?? 1);

type Outcome = {
  feature: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  micros: number;
  ok: boolean;
  note: string;
};

const results: Outcome[] = [];

async function run(
  feature: "plan-read" | "navigation" | "material-aliases",
  model: string,
  params: Parameters<typeof invokeLLM>[0]
) {
  process.stdout.write(`\n── ${feature} (${model}) ──\n`);
  try {
    const result = await invokeLLM(params);
    const message = result.choices?.[0]?.message;
    const text =
      typeof message?.content === "string" ? message.content.trim() : "";
    const call = message?.tool_calls?.[0];
    const usage = {
      inputTokens: Number(result.usage?.prompt_tokens ?? 0),
      outputTokens: Number(result.usage?.completion_tokens ?? 0),
    };
    const note = call
      ? `tool call: ${call.function?.name}(${call.function?.arguments?.slice(0, 90)}…)`
      : text
        ? `text: ${text.slice(0, 110).replace(/\s+/g, " ")}…`
        : "(no content)";
    console.log(`  ${note}`);
    results.push({
      feature,
      model,
      ...usage,
      micros: costMicros(model, usage),
      ok: Boolean(call || text),
      note,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`  FAILED: ${reason}`);
    results.push({
      feature,
      model,
      inputTokens: 0,
      outputTokens: 0,
      micros: 0,
      ok: false,
      note: reason,
    });
  }
}

// 1. The plan reader — an image plus extracted text, the heaviest call.
await run("plan-read", PLAN_COPILOT_MODEL, {
  feature: "plan-read",
  user: { id: USER },
  model: PLAN_COPILOT_MODEL,
  maxTokens: 4000,
  messages: [
    {
      role: "system",
      content:
        "You are helping an electrical estimator read one sheet of a set of construction drawings. Answer only from what is on the sheet.",
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: "This is a test image, not a real drawing. Reply with one short sentence saying what you can and cannot make out on it.",
        },
        { type: "image_url", image_url: { url: syntheticSheetPng() } },
      ],
    },
  ],
});

// 2. The help assistant — a sentence in, a route out, via a tool.
await run("navigation", NAVIGATION_MODEL, {
  feature: "navigation",
  user: { id: USER },
  model: NAVIGATION_MODEL,
  maxTokens: 200,
  messages: [
    {
      role: "system",
      content:
        "You route a user to one screen of an estimating app. Call go_to_screen with one of: dashboard, materials, labor-rates, assemblies, settings.",
    },
    { role: "user", content: "where do I change my journeyman hourly rate?" },
  ],
  tools: [
    {
      type: "function",
      function: {
        name: "go_to_screen",
        description: "Send the user to one screen.",
        parameters: {
          type: "object",
          properties: {
            target: { type: "string" },
            reason: { type: "string" },
          },
          required: ["target"],
          additionalProperties: false,
        },
      },
    },
  ],
});

// 3. Material aliases — the real prompt the app uses.
await run("material-aliases", MATERIAL_ALIAS_MODEL, {
  feature: "material-aliases",
  user: { id: USER },
  model: MATERIAL_ALIAS_MODEL,
  maxTokens: 400,
  messages: [
    {
      role: "user",
      content: aliasPromptFor("Duplex receptacle", "Receptacles"),
    },
  ],
});

// ── What it cost ────────────────────────────────────────────────────────────
console.log("\n══ cost of this run ══════════════════════════════════════════");
let total = 0;
for (const r of results) {
  total += r.micros;
  console.log(
    `  ${r.ok ? "ok  " : "FAIL"} ${r.feature.padEnd(17)} ${r.model.padEnd(28)} ` +
      `in=${String(r.inputTokens).padStart(6)} out=${String(r.outputTokens).padStart(5)} ` +
      `${formatMicros(r.micros).padStart(9)}`
  );
}
console.log(`  ${"".padEnd(52)} total ${formatMicros(total)}`);
console.log(`  (${(total / 1_000_000).toFixed(4)} US dollars)\n`);

process.exit(results.every(r => r.ok) ? 0 : 1);
