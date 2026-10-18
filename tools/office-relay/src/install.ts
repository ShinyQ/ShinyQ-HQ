import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

/** Every command the installer writes contains this, so it only ever replaces or removes its own entries. */
export const MARKER = "office-relay hook";

export const COPILOT_EVENTS = ["sessionStart", "userPromptSubmitted", "preToolUse", "postToolUse", "postToolUseFailure", "permissionRequest", "notification", "agentStop", "errorOccurred", "sessionEnd"] as const;
export const CLAUDE_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest", "Notification", "Stop", "StopFailure", "SessionEnd"] as const;
export const CODEX_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "PostToolUse", "PermissionRequest", "Stop", "SessionEnd"] as const;

export interface InstallPaths {
  copilot: string;
  claude: string;
  codex: string;
  bin: string;
}

export function installPaths(home: string): InstallPaths {
  return {
    copilot: path.join(home, ".copilot", "hooks", "office.json"),
    claude: path.join(home, ".claude", "settings.json"),
    codex: path.join(home, ".codex", "hooks.json"),
    bin: path.join(home, ".local", "bin", "office-relay"),
  };
}

type Obj = Record<string, unknown>;
interface Group {
  matcher?: string;
  hooks: Obj[];
}

const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
/**
 * A hook must never fail (a Copilot preToolUse hook that exits non-zero denies the tool), even without Bun or the checkout.
 * Only the directory is quoted, so the line contains MARKER literally (`.../office-relay hook`).
 */
const command = (bin: string, agent: string, event: string) => `"${path.dirname(bin)}"/${path.basename(bin)} hook ${agent} ${event} 2>/dev/null || true`;
const ours = (h: Obj) => String(h.command ?? h.bash ?? "").includes(MARKER);

function withoutOurs(groups: unknown): Group[] {
  if (!Array.isArray(groups)) return [];
  return groups
    .filter(isObj)
    .map((g) => ({ ...g, hooks: (Array.isArray(g.hooks) ? g.hooks.filter(isObj) : []).filter((h) => !ours(h)) }))
    .filter((g) => g.hooks.length > 0);
}

/** Copilot CLI user hooks (`~/.copilot/hooks/office.json`): synchronous, so the relay returns at once. */
export function copilotHooks(bin: string): Obj {
  const entry = (event: string) => ({ type: "command", bash: command(bin, "copilot", event), timeoutSec: 5, ...(event === "preToolUse" ? { matcher: "bash|powershell" } : {}) });
  return { version: 1, hooks: Object.fromEntries(COPILOT_EVENTS.map((e) => [e, [entry(e)]])) };
}

/** Claude Code `~/.claude/settings.json`: async command hooks next to whatever else is configured. */
export function mergeClaude(settings: Obj, bin: string): Obj {
  const hooks: Obj = { ...(isObj(settings.hooks) ? settings.hooks : {}) };
  for (const e of CLAUDE_EVENTS) {
    hooks[e] = [...withoutOurs(hooks[e]), { ...(e === "PreToolUse" ? { matcher: "Bash" } : {}), hooks: [{ type: "command", command: command(bin, "claude", e), async: true, timeout: 5 }] }];
  }
  return { ...settings, hooks };
}

/** Codex `~/.codex/hooks.json`: async except SessionEnd (always synchronous in Codex, 1 s). Trust once in `/hooks`. */
export function mergeCodex(file: Obj, bin: string): Obj {
  const hooks: Obj = { ...(isObj(file.hooks) ? file.hooks : {}) };
  for (const e of CODEX_EVENTS) {
    const handler = e === "SessionEnd" ? { type: "command", command: command(bin, "codex", e), timeout: 1 } : { type: "command", command: command(bin, "codex", e), async: true, timeout: 5 };
    hooks[e] = [...withoutOurs(hooks[e]), { ...(e === "PreToolUse" ? { matcher: "^Bash$" } : {}), hooks: [handler] }];
  }
  return { ...file, hooks };
}

/** Removes the office entries and the events they leave empty. */
export function stripOurs(file: Obj): Obj {
  const hooks: Obj = {};
  for (const [event, groups] of Object.entries(isObj(file.hooks) ? file.hooks : {})) {
    const kept = withoutOurs(groups);
    if (kept.length > 0) hooks[event] = kept;
  }
  return { ...file, hooks };
}

function readJson(file: string): Obj {
  if (!existsSync(file)) return {};
  try {
    const value: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (isObj(value)) return value;
  } catch {
    // fall through
  }
  throw new Error(`office-relay: cannot parse ${file}; fix or move it, then run install again (nothing was changed)`);
}

function writeJson(file: string, value: Obj, stamp: number): void {
  mkdirSync(path.dirname(file), { recursive: true });
  if (existsSync(file)) copyFileSync(file, `${file}.office-backup-${stamp}`);
  writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

const hasMarker = (file: string) => existsSync(file) && readFileSync(file, "utf8").includes(MARKER);

export function installed(p: InstallPaths): Record<"copilot" | "claude" | "codex", boolean> {
  return { copilot: hasMarker(p.copilot), claude: hasMarker(p.claude), codex: hasMarker(p.codex) };
}

/** Installs the shim and the three hook configs. Parses every file first, so a broken one aborts before any write. */
export function install(home: string, opts: { cli: string; runtime: string; now?: number }): string[] {
  const p = installPaths(home);
  const stamp = opts.now ?? Date.now();
  const claude = mergeClaude(readJson(p.claude), p.bin);
  const codex = mergeCodex(readJson(p.codex), p.bin);
  mkdirSync(path.dirname(p.bin), { recursive: true });
  writeFileSync(p.bin, `#!/bin/sh\nexec "${opts.runtime}" "${opts.cli}" "$@"\n`);
  chmodSync(p.bin, 0o755);
  writeJson(p.copilot, copilotHooks(p.bin), stamp);
  writeJson(p.claude, claude, stamp);
  writeJson(p.codex, codex, stamp);
  return [
    `shim: ${p.bin}`,
    `GitHub Copilot: ${p.copilot}`,
    `Claude Code: ${p.claude} (backup next to it)`,
    `Codex: ${p.codex} (backup next to it)`,
    "Codex: open /hooks in Codex once and trust the office-relay hooks (again after any change to them).",
    "Key: security add-generic-password -s hq-office-ingest -a office-relay -w <OFFICE_INGEST_KEY>",
    "Check: office-relay status",
  ];
}

export function uninstall(home: string): string[] {
  const p = installPaths(home);
  const stamp = Date.now();
  if (existsSync(p.claude)) writeJson(p.claude, stripOurs(readJson(p.claude)), stamp);
  if (existsSync(p.codex)) writeJson(p.codex, stripOurs(readJson(p.codex)), stamp);
  rmSync(p.copilot, { force: true });
  rmSync(p.bin, { force: true });
  return ["office-relay hooks removed (backups kept next to the files)"];
}
