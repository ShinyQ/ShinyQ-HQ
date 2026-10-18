import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Sent } from "./beat";

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

/** `~/.office-relay/` (override the home with OFFICE_RELAY_HOME) and the pause file `~/.office-pause`. */
export function relayPaths(env: Partial<NodeJS.ProcessEnv> = process.env): RelayPaths {
  const user = env.HOME ?? "";
  const home = env.OFFICE_RELAY_HOME ?? path.join(user, ".office-relay");
  return { home, pause: path.join(user, ".office-pause"), config: path.join(home, "config.json"), salt: path.join(home, "salt"), sessions: path.join(home, "sessions"), log: path.join(home, "relay.log") };
}

function ensure(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
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
  writeFileSync(sentFile(paths, session), JSON.stringify(sent), { mode: 0o600 });
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
