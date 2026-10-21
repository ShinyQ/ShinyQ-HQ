import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { createServer as createNetServer, type AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOfficeBeat } from "@/lib/office/protocol";
import { HOOK_FIXTURES } from "./fixtures";

const CLI = path.resolve("tools/office-relay/src/cli.ts");
const home = () => mkdtempSync(path.join(tmpdir(), "relay-cli-"));
// Next.js types make NODE_ENV required in ProcessEnv.
const BASE_ENV = { PATH: process.env.PATH ?? "", NODE_ENV: "test" as const };
const run = (args: string[], env: Record<string, string>, input = "") => spawnSync("bun", [CLI, ...args], { input, encoding: "utf8", env: { ...BASE_ENV, ...env }, timeout: 10_000 });

describe("office-relay CLI", () => {
  it("hook: exit 0, empty stdout and stderr, one beat dispatched, fast", () => {
    const h = home();
    const spool = path.join(h, "spool");
    const started = Date.now();
    const r = run(["hook", "copilot", "preToolUse"], { HOME: h, OFFICE_RELAY_SPOOL: spool }, JSON.stringify(HOOK_FIXTURES.copilot.preToolUse));
    expect(Date.now() - started).toBeLessThan(3000);
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
    expect(r.stderr).toBe("");
    const [line] = readFileSync(spool, "utf8").trim().split("\n");
    expect(parseOfficeBeat(JSON.parse(line))).toMatchObject({ agent: "copilot", state: "testing" });
  });

  it("hook: still exit 0 and silent when the home cannot be written or stdin is garbage", () => {
    for (const env of [{ HOME: "/nonexistent/office-relay-test" }, { HOME: home() }]) {
      const r = run(["hook", "copilot", "preToolUse"], env, "garbage");
      expect(r.status).toBe(0);
      expect(r.stdout + r.stderr).toBe("");
    }
    const r = run(["hook", "copilot", "preToolUse"], { HOME: "/nonexistent/office-relay-test" }, JSON.stringify(HOOK_FIXTURES.copilot.preToolUse));
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe("");
  });

  it("hook: exit 0 and silent when the spool cannot be written (dispatch throws)", () => {
    const h = home();
    const r = run(["hook", "copilot", "preToolUse"], { HOME: h, OFFICE_RELAY_SPOOL: path.join(h, "missing", "dir", "spool") }, JSON.stringify(HOOK_FIXTURES.copilot.preToolUse));
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe("");
  });

  it("hook: the detached sender runs from / without .env files, even when the hook itself runs inside a repository", async () => {
    const h = home();
    const evil = path.join(h, "evil");
    mkdirSync(evil);
    const marker = path.join(h, "preload-ran");
    writeFileSync(path.join(evil, "bunfig.toml"), 'preload = ["./p.ts"]\n');
    writeFileSync(path.join(evil, "p.ts"), `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "x");\n`);
    writeFileSync(path.join(evil, "empty.toml"), "");
    const port = await new Promise<number>((resolve) => {
      const server = createNetServer().listen(0, "127.0.0.1", () => {
        const { port: p } = server.address() as AddressInfo;
        server.close(() => resolve(p));
      });
    });
    // The parent skips the repository's bunfig.toml through an empty --config; only the sender could still read it.
    const r = spawnSync("bun", ["--config=./empty.toml", "--no-env-file", CLI, "hook", "copilot", "preToolUse"], {
      input: JSON.stringify(HOOK_FIXTURES.copilot.preToolUse),
      encoding: "utf8",
      cwd: evil,
      env: { ...BASE_ENV, HOME: h, OFFICE_RELAY_KEY: "k", OFFICE_RELAY_ENDPOINT: `http://127.0.0.1:${port}/api/office/beat` },
      timeout: 10_000,
    });
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe("");
    const log = path.join(h, ".office-relay", "relay.log");
    for (let i = 0; i < 100 && !(existsSync(log) && readFileSync(log, "utf8").includes("send ")); i++) await new Promise((resolve) => setTimeout(resolve, 50));
    expect(readFileSync(log, "utf8")).toMatch(/ send 0\n$/);
    expect(existsSync(marker)).toBe(false);
  });

  it("send: posts the body signed with the key, and logs only the status", async () => {
    const h = home();
    const received: { body: string; signature: string | undefined }[] = [];
    const server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        received.push({ body, signature: req.headers["x-office-signature"] as string | undefined });
        res.writeHead(204).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as AddressInfo).port;
    const beat = JSON.stringify({ v: 1, agent: "claude", session: "e".repeat(64), state: "done", activity: "finished", ts: Date.now() });
    const child = spawn("bun", [CLI, "send"], { env: { ...BASE_ENV, HOME: h, OFFICE_BEAT: beat, OFFICE_RELAY_KEY: "k", OFFICE_RELAY_ENDPOINT: `http://127.0.0.1:${port}/api/office/beat` }, stdio: "ignore" });
    await new Promise((resolve) => child.on("close", resolve));
    server.close();
    expect(received).toEqual([{ body: beat, signature: `sha256=${createHmac("sha256", "k").update(beat).digest("hex")}` }]);
    expect(readFileSync(path.join(h, ".office-relay", "relay.log"), "utf8")).toMatch(/send 204\n$/);
  });

  it("send: refuses a non-local http endpoint override and an invalid body", () => {
    const h = home();
    const r = run(["send"], { HOME: h, OFFICE_BEAT: '{"v":1,"prompt":"x"}', OFFICE_RELAY_KEY: "k", OFFICE_RELAY_ENDPOINT: "http://evil.example/" });
    expect(r.status).toBe(0);
    expect(r.stdout + r.stderr).toBe("");
    expect(readFileSync(path.join(h, ".office-relay", "relay.log"), "utf8")).toContain("send invalid");
  });

  it("pause, status and resume", () => {
    const h = home();
    expect(run(["pause"], { HOME: h }).stdout).toContain("paused");
    expect(existsSync(path.join(h, ".office-pause"))).toBe(true);
    expect(run(["status"], { HOME: h, OFFICE_RELAY_KEY: "k" }).stdout).toMatch(/office-relay: paused[\s\S]*ingest key: found/);
    expect(run(["resume"], { HOME: h }).stdout).toContain("active");
    expect(existsSync(path.join(h, ".office-pause"))).toBe(false);
  });

  it("install copies the bundle into the install dir; status shows it; uninstall removes it", () => {
    const h = home();
    const dir = path.join(h, "program");
    const env = { HOME: h, OFFICE_RELAY_KEY: "k", OFFICE_RELAY_INSTALL_DIR: dir };
    const program = path.join(dir, "office-relay.js");
    expect(run(["status"], env).stdout).toContain("program: running from a checkout");
    const installed = run(["install"], env);
    expect(installed.status).toBe(0);
    expect(installed.stdout).toContain(`program: ${program}`);
    expect(readFileSync(path.join(h, ".local", "bin", "office-relay"), "utf8")).toContain(`--no-env-file '${program}' "$@"`);
    const shown = /program: (\S+) \(installed (\S+)\)/.exec(run(["status"], env).stdout);
    expect(shown?.[1]).toBe(program);
    // Node (vitest) and Bun round the file time's sub-millisecond part differently.
    expect(Math.abs(Date.parse(shown?.[2] ?? "") - statSync(program).mtimeMs)).toBeLessThan(2);
    expect(run(["uninstall"], env).status).toBe(0);
    expect(existsSync(program)).toBe(false);
    expect(run(["status"], env).stdout).toContain("program: running from a checkout");
  }, 30_000);

  it("hook: two helpers stopping at once in two processes both count (no phantom helper)", async () => {
    for (let round = 0; round < 3; round++) {
      const h = home();
      const spool = path.join(h, "spool");
      // No coalescing window: every count goes out at once, so the spool shows each one.
      const env = { ...BASE_ENV, HOME: h, OFFICE_RELAY_SPOOL: spool, OFFICE_RELAY_COALESCE_MS: "0" };
      const ids = ["helper-a", "helper-b"];
      for (const agentId of ids) expect(run(["hook", "copilot", "subagentStart"], env, JSON.stringify({ ...HOOK_FIXTURES.copilot.subagentStart, agentId })).status).toBe(0);
      const stop = (agentId: string) =>
        new Promise<number | null>((resolve) => {
          const child = spawn("bun", [CLI, "hook", "copilot", "subagentStop"], { env, stdio: ["pipe", "ignore", "ignore"] });
          child.on("exit", resolve);
          child.stdin.end(JSON.stringify({ ...HOOK_FIXTURES.copilot.subagentStop, agentId }));
        });
      expect(await Promise.all(ids.map(stop))).toEqual([0, 0]);
      const counts = readFileSync(spool, "utf8").trim().split("\n").map((l) => (JSON.parse(l) as { helpers?: number }).helpers);
      expect(counts).toEqual([1, 2, 1, 0]);
    }
  }, 30_000);

  it("hook: the detached trailing sender sends the queued change at the end of the window, and a final state cancels it", async () => {
    // Windows far longer than a hook's spawn, so a slow machine still queues the second event.
    const relayIn = (window: number) => {
      const h = home();
      const spool = path.join(h, "spool");
      const env = { HOME: h, OFFICE_RELAY_SPOOL: spool, OFFICE_RELAY_COALESCE_MS: String(window) };
      const hook = (event: string, payload: Record<string, unknown>) => run(["hook", "copilot", event], env, JSON.stringify(payload));
      const states = () => (existsSync(spool) ? readFileSync(spool, "utf8").trim().split("\n").filter(Boolean) : []).map((l) => (JSON.parse(l) as { state: string }).state);
      const log = () => readFileSync(path.join(h, ".office-relay", "relay.log"), "utf8");
      return { hook, states, log };
    };
    const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    const a = relayIn(1500);
    expect(a.hook("preToolUse", HOOK_FIXTURES.copilot.preToolUse).status).toBe(0);
    const queued = a.hook("postToolUse", HOOK_FIXTURES.copilot.postToolUseView);
    expect(queued.status).toBe(0);
    expect(queued.stdout + queued.stderr).toBe("");
    expect(a.states()).toEqual(["testing"]);
    for (let i = 0; i < 100 && a.states().length < 2; i++) await sleep(50);
    expect(a.states()).toEqual(["testing", "reviewing"]);
    expect(a.log()).toContain("copilot postToolUse reviewing queued");
    expect(a.log()).toContain("flush reviewing trailing sent");

    const b = relayIn(2000);
    expect(b.hook("preToolUse", HOOK_FIXTURES.copilot.preToolUse).status).toBe(0);
    expect(b.hook("postToolUse", HOOK_FIXTURES.copilot.postToolUseView).status).toBe(0);
    expect(b.hook("agentStop", HOOK_FIXTURES.copilot.agentStop).status).toBe(0);
    await sleep(2600);
    expect(b.states()).toEqual(["testing", "done"]);
  }, 30_000);

  it("pause: exit 1 with a message when the pause file cannot be written", () => {
    const file = path.join(home(), "not-a-dir");
    writeFileSync(file, "");
    const r = run(["pause"], { HOME: file });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/office-pause/);
  });
});
