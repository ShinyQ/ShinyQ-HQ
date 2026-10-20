import { randomBytes } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Sent } from "./beat";
import type { HelperState } from "./helpers";
import type { LastTool } from "./map";

export interface RelayConfig {
  endpoint: string;
  allow: string[];
}

export const DEFAULT_CONFIG: RelayConfig = { endpoint: "https://kurniadi.pages.dev/api/office/beat", allow: ["ShinyQ/*"] };

export interface RelayPaths {
  home: string;
  pause: string;
  config: string;
  salt: string;
  sessions: string;
  log: string;
}

const LOG_MAX_BYTES = 256 * 1024;

/**
 * `~/.office-relay/` (override the home with OFFICE_RELAY_HOME) and the pause file `~/.office-pause`. A missing or
 * empty HOME falls back to the OS home, so relay files never land in the agent's working directory.
 */
export function relayPaths(env: Partial<NodeJS.ProcessEnv> = process.env): RelayPaths {
  const user = env.HOME || homedir();
  const home = env.OFFICE_RELAY_HOME || path.join(user, ".office-relay");
  return { home, pause: path.join(user, ".office-pause"), config: path.join(home, "config.json"), salt: path.join(home, "salt"), sessions: path.join(home, "sessions"), log: path.join(home, "relay.log") };
}

function ensure(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
}

/**
 * Writes through a temp file in the same directory and renames it over the target, so a reader in another hook
 * process sees the old or the new content, never a truncated file.
 */
function writeAtomic(file: string, data: string): void {
  const tmp = `${file}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    writeFileSync(tmp, data, { mode: 0o600 });
    renameSync(tmp, file);
  } catch (error) {
    rmSync(tmp, { force: true });
    throw error;
  }
}

/** The pause between lock attempts, and the most a hook waits for the lock before going on unlocked. */
export const LOCK_WAIT_MS = 2;
export const LOCK_BUDGET_MS = 10;
/** A lock older than this was left by a hook that died; it is removed. */
export const LOCK_STALE_MS = 1000;

const sleeper = new Int32Array(new SharedArrayBuffer(4));
const sleep = (ms: number) => void Atomics.wait(sleeper, 0, 0, ms);

function tryLock(lock: string): boolean {
  try {
    closeSync(openSync(lock, "wx", 0o600));
    return true;
  } catch {
    try {
      if (Date.now() - statSync(lock).mtimeMs <= LOCK_STALE_MS) return false;
      unlinkSync(lock);
      closeSync(openSync(lock, "wx", 0o600));
      return true;
    } catch {
      // released or taken meanwhile
      return false;
    }
  }
}

/**
 * Runs `fn` while holding `<file>.lock` (created exclusively), so concurrent hook processes apply their updates one
 * after another. Synchronous and bounded: a try every LOCK_WAIT_MS, and after LOCK_BUDGET_MS it runs unlocked, so
 * the hook stays fast.
 */
export function withFileLock<T>(file: string, fn: () => T): T {
  const lock = `${file}.lock`;
  const deadline = performance.now() + LOCK_BUDGET_MS;
  let held = tryLock(lock);
  for (let left = deadline - performance.now(); !held && left > 0; left = deadline - performance.now()) {
    sleep(Math.min(LOCK_WAIT_MS, left));
    held = tryLock(lock);
  }
  try {
    return fn();
  } finally {
    if (held) rmSync(lock, { force: true });
  }
}

export function loadConfig(paths: RelayPaths): RelayConfig {
  try {
    const raw = JSON.parse(readFileSync(paths.config, "utf8")) as Partial<RelayConfig>;
    return {
      endpoint: typeof raw.endpoint === "string" && raw.endpoint.startsWith("https://") ? raw.endpoint : DEFAULT_CONFIG.endpoint,
      allow: Array.isArray(raw.allow) ? raw.allow.filter((a): a is string => typeof a === "string") : DEFAULT_CONFIG.allow,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

/** The local salt of session hashes, created once (32 random bytes, mode 0600). */
export function loadSalt(paths: RelayPaths): string {
  try {
    const salt = readFileSync(paths.salt, "utf8").trim();
    if (salt.length >= 32) return salt;
  } catch {
    // first run
  }
  ensure(paths.home);
  const salt = randomBytes(32).toString("hex");
  writeFileSync(paths.salt, salt, { mode: 0o600 });
  return salt;
}

export function isPaused(paths: RelayPaths): boolean {
  return existsSync(paths.pause);
}

const sentFile = (paths: RelayPaths, session: string) => path.join(paths.sessions, `${session.slice(0, 32)}.json`);

export function readSent(paths: RelayPaths, session: string): Sent | null {
  try {
    return JSON.parse(readFileSync(sentFile(paths, session), "utf8")) as Sent;
  } catch {
    return null;
  }
}

export function writeSent(paths: RelayPaths, session: string, sent: Sent): void {
  ensure(paths.sessions);
  writeAtomic(sentFile(paths, session), JSON.stringify(sent));
}

const toolFile = (paths: RelayPaths, session: string) => path.join(paths.sessions, `${session.slice(0, 32)}.tool.json`);

export function readLastTool(paths: RelayPaths, session: string): LastTool | null {
  try {
    const raw = JSON.parse(readFileSync(toolFile(paths, session), "utf8")) as Partial<LastTool>;
    return typeof raw.tool === "string" && typeof raw.at === "number" ? { tool: raw.tool, at: raw.at } : null;
  } catch {
    return null;
  }
}

export function writeLastTool(paths: RelayPaths, session: string, last: LastTool): void {
  ensure(paths.sessions);
  writeAtomic(toolFile(paths, session), JSON.stringify(last));
}

export const helpersFile = (paths: RelayPaths, session: string) => path.join(paths.sessions, `${session.slice(0, 32)}.helpers.json`);

/** A session's helpers (salted id hashes to start times); a missing or broken file is an empty state. */
export function readHelpers(paths: RelayPaths, session: string): HelperState {
  try {
    const raw = JSON.parse(readFileSync(helpersFile(paths, session), "utf8")) as { ids?: unknown };
    const ids = typeof raw.ids === "object" && raw.ids !== null && !Array.isArray(raw.ids) ? (raw.ids as Record<string, unknown>) : {};
    return { ids: Object.fromEntries(Object.entries(ids).filter((e): e is [string, number] => e[0].length <= 64 && typeof e[1] === "number" && Number.isFinite(e[1]))) };
  } catch {
    return { ids: {} };
  }
}

export function writeHelpers(paths: RelayPaths, session: string, state: HelperState): void {
  ensure(paths.sessions);
  writeAtomic(helpersFile(paths, session), JSON.stringify(state));
}

/**
 * Runs `fn` under the session's helpers lock (see `withFileLock`); `fn` reads, applies and writes the helpers file and
 * may record what it sends, so two hook processes never apply their updates to the same old state.
 */
export function withHelpersLock<T>(paths: RelayPaths, session: string, fn: () => T): T {
  ensure(paths.sessions);
  return withFileLock(helpersFile(paths, session), fn);
}

/** Read, apply, write under the lock; returns the written state. */
export function updateHelpers(paths: RelayPaths, session: string, apply: (state: HelperState) => HelperState): HelperState {
  return withHelpersLock(paths, session, () => {
    const next = apply(readHelpers(paths, session));
    writeHelpers(paths, session, next);
    return next;
  });
}

/** Forgets a session's helpers (its session ended). */
export function clearHelpers(paths: RelayPaths, session: string): void {
  withHelpersLock(paths, session, () => rmSync(helpersFile(paths, session), { force: true }));
}

/** One line per decision (agent, event, state, outcome); never payload text. Rotates at 256 KB. */
export function appendLog(paths: RelayPaths, line: string): void {
  ensure(paths.home);
  try {
    if (statSync(paths.log).size > LOG_MAX_BYTES) renameSync(paths.log, `${paths.log}.1`);
  } catch {
    // no log yet
  }
  appendFileSync(paths.log, `${new Date().toISOString()} ${line}\n`, { mode: 0o600 });
}
