import { spawn, spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

  it("pause: exit 1 with a message when the pause file cannot be written", () => {
    const file = path.join(home(), "not-a-dir");
    writeFileSync(file, "");
    const r = run(["pause"], { HOME: file });
    expect(r.status).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.stderr).toMatch(/office-pause/);
  });
});
