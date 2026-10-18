import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CLAUDE_EVENTS, CODEX_EVENTS, copilotHooks, COPILOT_EVENTS, install, installed, installPaths, MARKER, uninstall } from "../../tools/office-relay/src/install";

const opts = { cli: "/repo/tools/office-relay/src/cli.ts", runtime: "/opt/bun/bin/bun", now: 1_792_327_344_000 };
const json = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const cmd = (bin: string, agent: string, event: string) => `"${path.dirname(bin)}"/office-relay hook ${agent} ${event} 2>/dev/null || true`;

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

    expect(readFileSync(p.bin, "utf8")).toBe(`#!/bin/sh\nexec "${opts.runtime}" "${opts.cli}" "$@"\n`);
    expect(statSync(p.bin).mode & 0o111).not.toBe(0);
    expect(readdirSync(path.join(home, ".claude")).some((f) => f.startsWith("settings.json.office-backup-"))).toBe(true);
    expect(report.join("\n")).toContain("Codex: open /hooks");
    expect(installed(p)).toEqual({ copilot: true, claude: true, codex: true });
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
});
