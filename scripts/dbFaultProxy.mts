/**
 * A FAULTY DATABASE ON DEMAND — for failure drills, without touching MySQL.
 *
 *   pnpm tsx scripts/dbFaultProxy.mts            # listens on 3399 → 127.0.0.1:3307
 *   curl -X POST localhost:3398/mode/pass        # normal
 *   curl -X POST localhost:3398/mode/slow/3000   # every packet waits 3 s
 *   curl -X POST localhost:3398/mode/hang        # connections open, nothing answers
 *   curl -X POST localhost:3398/mode/down        # every connection cut, new ones refused
 *
 * The shared MySQL (port 3307) serves every track and is NEVER stopped
 * (memory: leave-shared-mysql-running). So a drill points ONE dev server at
 * this proxy instead — DATABASE_URL=...@127.0.0.1:3399/<db> — and breaks the
 * proxy, not the database. Local only: it listens on 127.0.0.1.
 */
import net from "node:net";
import http from "node:http";

const LISTEN = Number(process.env.FAULT_PORT ?? 3399);
const CONTROL = Number(process.env.FAULT_CONTROL_PORT ?? 3398);
const TARGET = {
  host: "127.0.0.1",
  port: Number(process.env.FAULT_TARGET ?? 3307),
};

type Mode =
  | { kind: "pass" }
  | { kind: "slow"; ms: number }
  | { kind: "hang" }
  | { kind: "down" };
let mode: Mode = { kind: "pass" };
const live = new Set<net.Socket>();

const server = net.createServer(client => {
  if (mode.kind === "down") {
    client.destroy();
    return;
  }
  live.add(client);
  const upstream = net.connect(TARGET);
  live.add(upstream);
  const forward = (from: net.Socket, to: net.Socket) =>
    from.on("data", chunk => {
      const m = mode;
      if (m.kind === "hang") return; // swallowed: the caller waits forever
      if (m.kind === "slow")
        setTimeout(() => to.writable && to.write(chunk), m.ms);
      else if (to.writable) to.write(chunk);
    });
  forward(client, upstream);
  forward(upstream, client);
  const close = () => {
    client.destroy();
    upstream.destroy();
    live.delete(client);
    live.delete(upstream);
  };
  client.on("error", close).on("close", close);
  upstream.on("error", close).on("close", close);
});
server.listen(LISTEN, "127.0.0.1", () =>
  console.log(
    `db fault proxy: 127.0.0.1:${LISTEN} -> ${TARGET.host}:${TARGET.port} (control :${CONTROL})`
  )
);

http
  .createServer((req, res) => {
    const parts = (req.url ?? "").split("/").filter(Boolean);
    if (req.method === "POST" && parts[0] === "mode") {
      if (parts[1] === "slow")
        mode = { kind: "slow", ms: Number(parts[2] ?? 2000) };
      else if (
        parts[1] === "hang" ||
        parts[1] === "down" ||
        parts[1] === "pass"
      )
        mode = { kind: parts[1] } as Mode;
      if (mode.kind === "down") for (const s of live) s.destroy();
      console.log(`mode -> ${JSON.stringify(mode)}`);
    }
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ mode, connections: live.size / 2 }));
  })
  .listen(CONTROL, "127.0.0.1");
