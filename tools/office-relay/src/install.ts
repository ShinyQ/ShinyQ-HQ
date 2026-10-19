import { spawnSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
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
  /** The installed single-file bundle, outside any checkout (`OFFICE_RELAY_INSTALL_DIR` overrides the directory). */
  program: string;
}

export function installPaths(home: string, env: Partial<NodeJS.ProcessEnv> = process.env): InstallPaths {
  return {
    copilot: path.join(home, ".copilot", "hooks", "office.json"),
    claude: path.join(home, ".claude", "settings.json"),
    codex: path.join(home, ".codex", "hooks.json"),
    bin: path.join(home, ".local", "bin", "office-relay"),
    program: path.join(env.OFFICE_RELAY_INSTALL_DIR || path.join(home, ".hq-office-relay"), "office-relay.js"),
  };
}

type Obj = Record<string, unknown>;
interface Group {
  matcher?: string;
  hooks: Obj[];
}

const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
/** POSIX single quoting: nothing inside is expanded, and `'` becomes `'\''`. */
const shq = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
/**
 * A hook must never fail (a Copilot preToolUse hook that exits non-zero denies the tool), even without Bun or the checkout.
 * Only the directory is quoted, so the line contains MARKER literally (`'<dir>'/office-relay hook`).
 */
const command = (bin: string, agent: string, event: string) => `${shq(path.dirname(bin))}/${path.basename(bin)} hook ${agent} ${event} 2>/dev/null || true`;
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
  throw new Error(`office-relay: cannot parse ${file}; fix or move it, then run the command again; nothing was changed`);
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

/** Bundles `entry` and everything it imports into one file at `out` (written next to it, then renamed). */
function bundle(entry: string, runtime: string, out: string): void {
  mkdirSync(path.dirname(out), { recursive: true });
  const tmp = `${out}.tmp-${process.pid}`;
  // `--minify-whitespace` also drops the per-module source path comments, so the bundle names no checkout path.
  const r = spawnSync(runtime, ["build", "--target=bun", "--minify-whitespace", `--outfile=${tmp}`, entry], { cwd: "/", encoding: "utf8", timeout: 60_000 });
  if (r.status !== 0 || !existsSync(tmp)) {
    rmSync(tmp, { force: true });
    throw new Error(`office-relay: cannot bundle ${entry}; nothing was changed\n${r.stderr || r.error?.message || ""}`.trim());
  }
  renameSync(tmp, out);
}

/**
 * Installs the shim and the three hook configs. Parses every file first, so a broken one aborts before any write.
 * With `bundle`, `cli` is bundled into `program` and the shim runs that copy, so the checkout can be deleted afterwards.
 */
export function install(home: string, opts: { cli: string; runtime: string; now?: number; bundle?: boolean }): string[] {
  const p = installPaths(home);
  const stamp = opts.now ?? Date.now();
  const claude = mergeClaude(readJson(p.claude), p.bin);
  const codex = mergeCodex(readJson(p.codex), p.bin);
  if (opts.bundle) bundle(opts.cli, opts.runtime, p.program);
  const program = opts.bundle ? p.program : opts.cli;
  mkdirSync(path.dirname(p.bin), { recursive: true });
  // From `/` and without .env files: the agent's repository (its bunfig.toml preload, its .env) never reaches the relay.
  writeFileSync(p.bin, `#!/bin/sh\ncd / && exec ${shq(opts.runtime)} --no-env-file ${shq(program)} "$@"\n`);
  chmodSync(p.bin, 0o755);
  writeJson(p.copilot, copilotHooks(p.bin), stamp);
  writeJson(p.claude, claude, stamp);
  writeJson(p.codex, codex, stamp);
  return [
    ...(opts.bundle ? [`program: ${p.program}`] : []),
    `shim: ${p.bin}`,
    `GitHub Copilot: ${p.copilot}`,
    `Claude Code: ${p.claude} (backup next to it)`,
    `Codex: ${p.codex} (backup next to it)`,
    "Codex: open /hooks in Codex once and trust the office-relay hooks (again after any change to them).",
    "Key: security add-generic-password -s hq-office-ingest -a office-relay -w <OFFICE_INGEST_KEY>",
    "Check: office-relay status",
  ];
}

/** Parses both files first, so a broken one aborts before any write or removal. */
export function uninstall(home: string): string[] {
  const p = installPaths(home);
  const stamp = Date.now();
  const claude = existsSync(p.claude) ? stripOurs(readJson(p.claude)) : null;
  const codex = existsSync(p.codex) ? stripOurs(readJson(p.codex)) : null;
  if (claude) writeJson(p.claude, claude, stamp);
  if (codex) writeJson(p.codex, codex, stamp);
  rmSync(p.copilot, { force: true });
  rmSync(p.bin, { force: true });
  rmSync(p.program, { force: true });
  return ["office-relay hooks and program removed (backups kept next to the files; ~/.office-relay data stays)"];
}
