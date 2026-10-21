import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { CLAUDE_EVENTS, CODEX_EVENTS, copilotHooks, COPILOT_EVENTS, install, installed, installPaths, MARKER, uninstall } from "../../tools/office-relay/src/install";
import { HOOK_FIXTURES } from "./fixtures";

const opts = { cli: "/repo/tools/office-relay/src/cli.ts", runtime: "/opt/bun/bin/bun", now: 1_792_327_344_000 };
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const cmd = (bin: string, agent: string, event: string) => `'${path.dirname(bin)}'/office-relay hook ${agent} ${event} 2>/dev/null || true`;

function homeWithClaude(settings: unknown) {
  const home = mkdtempSync(path.join(tmpdir(), "relay-install-"));
  mkdirSync(path.join(home, ".claude"));
  writeFileSync(path.join(home, ".claude", "settings.json"), JSON.stringify(settings));
  return home;
}

describe("install", () => {
  it("writes Copilot's file, merges Claude Code and Codex, keeps other settings, backs up, adds the shim", () => {
    const other = { matcher: "Bash", hooks: [{ type: "command", command: "~/bin/my-guard.sh" }] };
    const home = homeWithClaude({ theme: "dark", hooks: { PreToolUse: [other] } });
    const report = install(home, opts);
    const p = installPaths(home);

    const copilot = json(p.copilot);
    expect(copilot.version).toBe(1);
    expect(Object.keys(copilot.hooks)).toEqual([...COPILOT_EVENTS]);
    expect(copilot.hooks.preToolUse[0]).toEqual({ type: "command", bash: cmd(p.bin, "copilot", "preToolUse"), timeoutSec: 5, matcher: "bash|powershell" });

    const claude = json(p.claude);
    expect(claude.theme).toBe("dark");
    expect(claude.hooks.PreToolUse[0]).toEqual(other);
    expect(claude.hooks.PreToolUse[1]).toEqual({ matcher: "Bash", hooks: [{ type: "command", command: cmd(p.bin, "claude", "PreToolUse"), async: true, timeout: 5 }] });
    expect(Object.keys(claude.hooks)).toEqual(expect.arrayContaining([...CLAUDE_EVENTS]));

    const codex = json(p.codex);
    expect(Object.keys(codex.hooks)).toEqual([...CODEX_EVENTS]);
    expect(codex.hooks.SessionEnd[0].hooks[0]).toEqual({ type: "command", command: cmd(p.bin, "codex", "SessionEnd"), timeout: 1 });
    expect(codex.hooks.PreToolUse[0].matcher).toBe("^Bash$");
    expect(codex.hooks.Stop[0].hooks[0].async).toBe(true);

    expect(readFileSync(p.bin, "utf8")).toBe(`#!/bin/sh\ncd / && exec '${opts.runtime}' --no-env-file '${opts.cli}' "$@"\n`);
    expect(statSync(p.bin).mode & 0o111).not.toBe(0);
    expect(readdirSync(path.join(home, ".claude")).some((f) => f.startsWith("settings.json.office-backup-"))).toBe(true);
    expect(report.join("\n")).toContain("Codex: open /hooks");
    expect(installed(p)).toEqual({ copilot: true, claude: true, codex: true });
  });

  it("hooks every tool's sub-agent start and stop (no matcher, so every helper type counts) and uninstall removes them", () => {
    const home = homeWithClaude({ hooks: { SubagentStop: [{ hooks: [{ type: "command", command: "~/bin/mine.sh" }] }] } });
    install(home, opts);
    const p = installPaths(home);
    expect(COPILOT_EVENTS).toEqual(expect.arrayContaining(["subagentStart", "subagentStop"]));
    expect(CLAUDE_EVENTS).toEqual(expect.arrayContaining(["SubagentStart", "SubagentStop"]));
    expect(CODEX_EVENTS).toEqual(expect.arrayContaining(["SubagentStart", "SubagentStop"]));
    const copilot = json(p.copilot).hooks;
    for (const e of ["subagentStart", "subagentStop"]) expect(copilot[e]).toEqual([{ type: "command", bash: cmd(p.bin, "copilot", e), timeoutSec: 5 }]);
    const claude = json(p.claude).hooks;
    expect(claude.SubagentStart).toEqual([{ hooks: [{ type: "command", command: cmd(p.bin, "claude", "SubagentStart"), async: true, timeout: 5 }] }]);
    expect(claude.SubagentStop[1]).toEqual({ hooks: [{ type: "command", command: cmd(p.bin, "claude", "SubagentStop"), async: true, timeout: 5 }] });
    const codex = json(p.codex).hooks;
    for (const e of ["SubagentStart", "SubagentStop"]) expect(codex[e]).toEqual([{ hooks: [{ type: "command", command: cmd(p.bin, "codex", e), async: true, timeout: 5 }] }]);

    uninstall(home);
    expect(json(p.claude).hooks).toEqual({ SubagentStop: [{ hooks: [{ type: "command", command: "~/bin/mine.sh" }] }] });
    expect(json(p.codex).hooks).toEqual({});
    expect(existsSync(p.copilot)).toBe(false);
  });

  it("writes hook commands that never fail, even when the shim is missing", () => {
    const bin = path.join(mkdtempSync(path.join(tmpdir(), "relay-install-")), "missing", "office-relay");
    const hooks = copilotHooks(bin) as { hooks: Record<string, { bash: string }[]> };
    const line = hooks.hooks.preToolUse[0].bash;
    expect(line).toContain(MARKER);
    const run = spawnSync("/bin/sh", ["-c", line], { input: "{}", encoding: "utf8" });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("");
  });

  it.each(["with space", "it's", 'say "hi"', "$(echo X)", "$(touch relay-pwned)"])("quotes a directory named %s in the hook line and the shim", (name) => {
    const root = mkdtempSync(path.join(tmpdir(), "relay-install-"));
    const home = path.join(root, name);
    const work = path.join(root, "work");
    mkdirSync(work);
    mkdirSync(home);
    const runtime = path.join(home, "runtime");
    const out = path.join(root, "argv.txt");
    writeFileSync(runtime, `#!/bin/sh\nprintf '%s\\n' "$@" > "$OUT"\n`);
    chmodSync(runtime, 0o755);
    const cli = path.join(home, "cli.ts");
    install(home, { cli, runtime, now: opts.now });
    const p = installPaths(home);
    const line = json(p.copilot).hooks.preToolUse[0].bash as string;
    expect(line).toContain(MARKER);
    const run = spawnSync("/bin/sh", ["-c", line], { input: "{}", encoding: "utf8", cwd: work, env: { ...process.env, OUT: out } });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("");
    expect(readFileSync(out, "utf8")).toBe(`--no-env-file\n${cli}\nhook\ncopilot\npreToolUse\n`);
    expect(existsSync(path.join(work, "relay-pwned"))).toBe(false);
    expect(existsSync(path.join(root, "relay-pwned"))).toBe(false);
  });

  it("is idempotent: a second install keeps one office entry per event", () => {
    const home = homeWithClaude({});
    install(home, opts);
    install(home, { ...opts, now: opts.now + 1 });
    const p = installPaths(home);
    for (const event of CLAUDE_EVENTS) expect(JSON.stringify(json(p.claude).hooks[event]).split(MARKER).length - 1).toBe(1);
    for (const event of CODEX_EVENTS) expect(JSON.stringify(json(p.codex).hooks[event]).split(MARKER).length - 1).toBe(1);
  });

  it("refuses to touch a settings file it cannot parse", () => {
    const home = mkdtempSync(path.join(tmpdir(), "relay-install-"));
    mkdirSync(path.join(home, ".claude"));
    writeFileSync(path.join(home, ".claude", "settings.json"), "{ not json");
    expect(() => install(home, opts)).toThrow(/settings\.json/);
    expect(readFileSync(path.join(home, ".claude", "settings.json"), "utf8")).toBe("{ not json");
    expect(existsSync(installPaths(home).copilot)).toBe(false);
  });

  it("uninstall removes only the office entries, the Copilot file and the shim", () => {
    const other = { hooks: [{ type: "command", command: "~/bin/notify.sh" }] };
    const home = homeWithClaude({ hooks: { Stop: [other] } });
    install(home, opts);
    uninstall(home);
    const p = installPaths(home);
    expect(json(p.claude).hooks).toEqual({ Stop: [other] });
    expect(json(p.codex).hooks).toEqual({});
    expect(existsSync(p.copilot)).toBe(false);
    expect(existsSync(p.bin)).toBe(false);
    expect(installed(p)).toEqual({ copilot: false, claude: false, codex: false });
  });

  it("uninstall changes nothing when hooks.json cannot be parsed", () => {
    const home = homeWithClaude({ theme: "dark" });
    install(home, opts);
    const p = installPaths(home);
    writeFileSync(p.codex, "{ not json");
    const claudeBefore = readFileSync(p.claude, "utf8");
    const copilotBefore = readFileSync(p.copilot, "utf8");
    const shimBefore = readFileSync(p.bin, "utf8");
    expect(() => uninstall(home)).toThrow(/hooks\.json; fix or move it, then run the command again; nothing was changed/);
    expect(readFileSync(p.claude, "utf8")).toBe(claudeBefore);
    expect(readFileSync(p.copilot, "utf8")).toBe(copilotBefore);
    expect(readFileSync(p.bin, "utf8")).toBe(shimBefore);
    expect(readFileSync(p.codex, "utf8")).toBe("{ not json");
  });

  it("bundles the relay into ~/.hq-office-relay and the hooks run from that copy alone", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "relay-bundle-"));
    const [home, work, relayHome] = ["home", "work", "relay"].map((d) => path.join(root, d));
    for (const dir of [home, work]) mkdirSync(dir);
    const bun = process.versions.bun ? process.execPath : spawnSync("which", ["bun"], { encoding: "utf8" }).stdout.trim();
    const report = install(home, { cli: path.resolve("tools/office-relay/src/cli.ts"), runtime: bun, now: opts.now, bundle: true });
    const p = installPaths(home);
    expect(p.program).toBe(path.join(home, ".hq-office-relay", "office-relay.js"));
    expect(installPaths(home, { OFFICE_RELAY_INSTALL_DIR: path.join(root, "elsewhere") }).program).toBe(path.join(root, "elsewhere", "office-relay.js"));
    expect(report[0]).toBe(`program: ${p.program}`);
    expect(readFileSync(p.bin, "utf8")).toBe(`#!/bin/sh\ncd / && exec '${bun}' --no-env-file '${p.program}' "$@"\n`);
    expect(readdirSync(path.dirname(p.program))).toEqual(["office-relay.js"]);

    // Fully bundled: no relative or `@/` import left, and nothing points back into the checkout (SELF comes from import.meta.url at run time).
    const program = readFileSync(p.program, "utf8");
    expect(program).not.toMatch(/(from\s*|import\s*\(\s*|require\s*\(\s*)["'](\.{1,2}|@)\//);
    // Bun names modules relative to `/` (no leading slash), so look for the path without it.
    expect(program).not.toContain(process.cwd().slice(1));
    expect(program).toContain("fileURLToPath(import.meta.url)");

    const line = json(p.copilot).hooks.preToolUse[0].bash as string;
    const spool = path.join(root, "spool");
    const env = { PATH: process.env.PATH ?? "", NODE_ENV: "test" as const, HOME: home, OFFICE_RELAY_HOME: relayHome };
    const input = JSON.stringify(HOOK_FIXTURES.copilot.preToolUse);
    const spooled = spawnSync("/bin/sh", ["-c", line], { input, encoding: "utf8", cwd: work, env: { ...env, OFFICE_RELAY_SPOOL: spool }, timeout: 10_000 });
    expect(spooled.status).toBe(0);
    expect(spooled.stdout + spooled.stderr).toBe("");
    expect(JSON.parse(readFileSync(spool, "utf8").trim())).toMatchObject({ v: 1, agent: "copilot", state: "testing" });

    // The detached sender is the bundle too: a closed local port gives `send 0`.
    const port = await new Promise<number>((resolve) => {
      const server = createServer().listen(0, "127.0.0.1", () => {
        const { port: free } = server.address() as { port: number };
        server.close(() => resolve(free));
      });
    });
    const failure = { ...HOOK_FIXTURES.copilot.preToolUse, sessionId: "bundle-send" };
    const sent = spawnSync("/bin/sh", ["-c", line], { input: JSON.stringify(failure), encoding: "utf8", cwd: work, env: { ...env, OFFICE_RELAY_KEY: "k", OFFICE_RELAY_ENDPOINT: `http://127.0.0.1:${port}/api/office/beat` }, timeout: 10_000 });
    expect(sent.status).toBe(0);
    expect(sent.stdout + sent.stderr).toBe("");
    const log = path.join(relayHome, "relay.log");
    for (let i = 0; i < 100 && !(existsSync(log) && readFileSync(log, "utf8").includes("send ")); i++) await new Promise((r) => setTimeout(r, 50));
    expect(readFileSync(log, "utf8")).toMatch(/\S+ send 0\n$/);

    uninstall(home);
    expect(existsSync(p.program)).toBe(false);
    expect(existsSync(p.bin)).toBe(false);
    expect(existsSync(path.join(relayHome, "relay.log"))).toBe(true);
  }, 30_000);

  it("aborts before any write when the bundle cannot be built", () => {
    const home = mkdtempSync(path.join(tmpdir(), "relay-install-"));
    const bun = process.versions.bun ? process.execPath : spawnSync("which", ["bun"], { encoding: "utf8" }).stdout.trim();
    expect(() => install(home, { cli: path.join(home, "missing.ts"), runtime: bun, now: opts.now, bundle: true })).toThrow(/cannot bundle/);
    const p = installPaths(home);
    for (const file of [p.copilot, p.claude, p.codex, p.bin, p.program]) expect(existsSync(file)).toBe(false);
    expect(existsSync(path.dirname(p.program)) ? readdirSync(path.dirname(p.program)) : []).toEqual([]);
  }, 30_000);

  it("runs Bun from / without .env files, so the agent's repository cannot preload code or set relay overrides", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "relay-evil-"));
    const [home, evil, relayHome] = ["home", "evil", "relay"].map((d) => path.join(root, d));
    for (const dir of [home, evil]) mkdirSync(dir);
    const marker = path.join(root, "preload-ran");
    const spool = path.join(root, "evil-spool");
    writeFileSync(path.join(evil, "bunfig.toml"), 'preload = ["./p.ts"]\n');
    writeFileSync(path.join(evil, "p.ts"), `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "x");\nconsole.log("PRELOAD-RAN");\n`);
    writeFileSync(path.join(evil, ".env"), `OFFICE_RELAY_SPOOL=${spool}\n`);
    const bun = process.versions.bun ? process.execPath : spawnSync("which", ["bun"], { encoding: "utf8" }).stdout.trim();
    install(home, { cli: path.resolve("tools/office-relay/src/cli.ts"), runtime: bun, now: opts.now });
    // A closed 127.0.0.1 port: the detached sender gets a refused connection, never the network or the Keychain.
    const port = await new Promise<number>((resolve) => {
      const server = createServer().listen(0, "127.0.0.1", () => {
        const { port: p } = server.address() as { port: number };
        server.close(() => resolve(p));
      });
    });
    const env = { PATH: process.env.PATH ?? "", NODE_ENV: "test" as const, HOME: home, OFFICE_RELAY_HOME: relayHome, OFFICE_RELAY_KEY: "k", OFFICE_RELAY_ENDPOINT: `http://127.0.0.1:${port}/api/office/beat` };
    const line = json(installPaths(home).copilot).hooks.preToolUse[0].bash as string;
    const run = spawnSync("/bin/sh", ["-c", line], { input: JSON.stringify(HOOK_FIXTURES.copilot.preToolUse), encoding: "utf8", cwd: evil, env, timeout: 10_000 });
    expect(run.status).toBe(0);
    expect(run.stdout).toBe("");
    expect(run.stderr).toBe("");
    const log = path.join(relayHome, "relay.log");
    for (let i = 0; i < 100 && !(existsSync(log) && readFileSync(log, "utf8").includes("send ")); i++) await new Promise((r) => setTimeout(r, 50));
    expect(readFileSync(log, "utf8")).toMatch(/ copilot preToolUse testing sent\n\S+ send 0\n$/);
    expect(existsSync(marker)).toBe(false);
    expect(existsSync(spool)).toBe(false);
  });
});
