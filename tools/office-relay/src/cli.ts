#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { appendFileSync, existsSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseOfficeBeat } from "../../../src/lib/office/protocol";
import { readGit } from "./git";
import { COALESCE_MS } from "./beat";
import { flushSession, runHook } from "./hook";
import { install, installed, installPaths, uninstall } from "./install";
import { endpointOf, postBeat, readIngestKey } from "./send";
import { appendLog, isPaused, loadConfig, LOCK_BUDGET_MS, relayPaths, type RelayPaths } from "./store";

/** This file, or the installed bundle when running from it (Bun keeps `import.meta.url` as the bundle's own URL). */
const SELF = fileURLToPath(import.meta.url);

/** stdin of a hook, capped at 1 MB and 1 s (a hook that never closes stdin cannot hang the agent). */
function readStdin(timeoutMs = 1000, maxBytes = 1 << 20): Promise<string> {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) return resolve("");
    const chunks: Buffer[] = [];
    let size = 0;
    const done = () => {
      clearTimeout(timer);
      process.stdin.pause();
      resolve(Buffer.concat(chunks).toString("utf8"));
    };
    const timer = setTimeout(done, timeoutMs);
    process.stdin.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= maxBytes) chunks.push(chunk);
      else done();
    });
    process.stdin.on("end", done);
    process.stdin.on("error", done);
  });
}

/** Hands a beat to a detached `send` child, so the agent never waits for the network. */
function dispatch(body: string): void {
  const spool = process.env.OFFICE_RELAY_SPOOL;
  if (spool) {
    appendFileSync(spool, `${body}\n`);
    return;
  }
  const child = spawn(process.execPath, ["--no-env-file", SELF, "send"], { cwd: "/", detached: true, stdio: "ignore", env: { ...process.env, OFFICE_BEAT: body } });
  child.on("error", () => undefined);
  child.unref();
}

/** Starts the session's detached trailing sender (`flush`), which sleeps until `due`; the hook does not wait for it. */
function schedule(session: string, due: number, token: string): void {
  const child = spawn(process.execPath, ["--no-env-file", SELF, "flush", session, String(due), token], { cwd: "/", detached: true, stdio: "ignore", env: process.env });
  child.on("error", () => undefined);
  child.unref();
}

/** The coalescing window: COALESCE_MS, or OFFICE_RELAY_COALESCE_MS (0 to 60000 ms) for tests. */
function coalesceMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OFFICE_RELAY_COALESCE_MS;
  const n = raw && /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
  return n >= 0 && n <= 60_000 ? n : COALESCE_MS;
}

/** The lock wait: LOCK_BUDGET_MS, or OFFICE_RELAY_LOCK_MS (0 to 10000 ms) for tests that check the lock, not the clock. */
function lockBudgetMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OFFICE_RELAY_LOCK_MS;
  const n = raw && /^\d{1,5}$/.test(raw) ? Number(raw) : NaN;
  return n >= 0 && n <= 10_000 ? n : LOCK_BUDGET_MS;
}

/** The trailing sender ends after this many wakes (at most one per 10 to 15 s: about an hour); a stale `due` lets the next hook start another. */
const FLUSH_WAKES = 240;
const SESSION = /^[0-9a-f]{64}$/;
const TOKEN = /^[0-9a-f]{16}$/;

/**
 * The trailing sender: sleeps until `due`, then sends the session's queued change or keepalive (`flushSession`), and
 * sleeps again while the hooks keep something due. Ends when nothing is left, or when another sender owns the session.
 */
async function flush(paths: RelayPaths, session: string, dueArg: string, token: string): Promise<void> {
  if (!SESSION.test(session) || !TOKEN.test(token) || !/^\d{1,15}$/.test(dueArg)) return;
  let due: number | undefined = Number(dueArg);
  for (let wake = 0; due !== undefined && wake < FLUSH_WAKES; wake++) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, due! - Date.now())));
    const step = flushSession(paths, session, token, Date.now(), coalesceMs());
    if (step.body) {
      if (process.env.OFFICE_RELAY_SPOOL) appendFileSync(process.env.OFFICE_RELAY_SPOOL, `${step.body}\n`);
      else await post(paths, step.body);
    }
    due = step.due;
  }
}

async function send(paths: RelayPaths): Promise<void> {
  return post(paths, process.env.OFFICE_BEAT ?? "");
}

async function post(paths: RelayPaths, body: string): Promise<void> {
  let valid = false;
  try {
    valid = parseOfficeBeat(JSON.parse(body)) !== null;
  } catch {
    valid = false;
  }
  if (!valid) return appendLog(paths, "send invalid");
  const key = readIngestKey();
  if (!key) return appendLog(paths, "send no-key");
  const status = await postBeat(body, { endpoint: endpointOf(loadConfig(paths)), key });
  appendLog(paths, `send ${status}`);
}

function status(paths: RelayPaths): string {
  const config = loadConfig(paths);
  let tail: string[] = [];
  try {
    tail = readFileSync(paths.log, "utf8").trim().split("\n").slice(-10);
  } catch {
    tail = ["(no events yet)"];
  }
  const install = installPaths(process.env.HOME || homedir());
  const program = existsSync(install.program) ? `${install.program} (installed ${statSync(install.program).mtime.toISOString()})` : "running from a checkout";
  return [
    `office-relay: ${isPaused(paths) ? "paused" : "active"}`,
    `program: ${program}`,
    `endpoint: ${config.endpoint}`,
    `ingest key: ${readIngestKey() ? "found" : "missing (security add-generic-password -s hq-office-ingest -a office-relay -w <key>)"}`,
    `allowlist: ${config.allow.join(", ")}`,
    ...Object.entries(installed(install)).map(([agent, ok]) => `hooks ${agent}: ${ok ? "installed" : "not installed"}`),
    "last events:",
    ...tail.map((l) => `  ${l}`),
  ].join("\n");
}

const USAGE = "usage: office-relay hook <agent> <event> | send | flush <session> <due> <token> | pause | resume | status | install | uninstall";

async function main(argv: string[]): Promise<void> {
  const [command, a = "", b = ""] = argv;
  const paths = relayPaths();
  switch (command) {
    case "hook":
      runHook(a, b, await readStdin(), { paths, now: Date.now, readGit: (cwd) => readGit(cwd), dispatch, schedule, coalesceMs: coalesceMs(), lockBudgetMs: lockBudgetMs() });
      return;
    case "send":
      return send(paths);
    case "flush":
      return flush(paths, a, b, argv[3] ?? "");
    case "pause":
      writeFileSync(paths.pause, "");
      console.log("office-relay: paused (nothing is sent until `office-relay resume`)");
      return;
    case "resume":
      rmSync(paths.pause, { force: true });
      console.log("office-relay: active");
      return;
    case "status":
      console.log(status(paths));
      return;
    case "install":
      console.log(install(process.env.HOME || homedir(), { cli: SELF, runtime: process.execPath, bundle: true }).join("\n"));
      return;
    case "uninstall":
      console.log(uninstall(process.env.HOME || homedir()).join("\n"));
      return;
    default:
      console.log(USAGE);
  }
}

const argv = process.argv.slice(2);
// The background commands never print, even for an error that escapes main (an unhandled rejection or exception).
const BACKGROUND = new Set(["hook", "send", "flush"]);
if (BACKGROUND.has(argv[0])) {
  process.on("uncaughtException", () => process.exit(0));
  process.on("unhandledRejection", () => process.exit(0));
}

// A hook must never fail or print: hook, send and flush swallow errors and exit 0. Every owner command reports its error (exit 1).
main(argv)
  .catch((error: unknown) => {
    if (!BACKGROUND.has(argv[0])) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  })
  .finally(() => process.exit(process.exitCode ?? 0));
