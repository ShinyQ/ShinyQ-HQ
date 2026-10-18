#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parseOfficeBeat } from "../../../src/lib/office/protocol";
import { readGit } from "./git";
import { runHook } from "./hook";
import { install, installed, installPaths, uninstall } from "./install";
import { endpointOf, postBeat, readIngestKey } from "./send";
import { appendLog, isPaused, loadConfig, relayPaths, type RelayPaths } from "./store";

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
  const child = spawn(process.execPath, [SELF, "send"], { detached: true, stdio: "ignore", env: { ...process.env, OFFICE_BEAT: body } });
  child.on("error", () => undefined);
  child.unref();
}

async function send(paths: RelayPaths): Promise<void> {
  const body = process.env.OFFICE_BEAT ?? "";
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
  return [
    `office-relay: ${isPaused(paths) ? "paused" : "active"}`,
    `endpoint: ${config.endpoint}`,
    `ingest key: ${readIngestKey() ? "found" : "missing (security add-generic-password -s hq-office-ingest -a office-relay -w <key>)"}`,
    `allowlist: ${config.allow.join(", ")}`,
    ...Object.entries(installed(installPaths(process.env.HOME || homedir()))).map(([agent, ok]) => `hooks ${agent}: ${ok ? "installed" : "not installed"}`),
    "last events:",
    ...tail.map((l) => `  ${l}`),
  ].join("\n");
}

const USAGE = "usage: office-relay hook <agent> <event> | send | pause | resume | status | install | uninstall";

async function main(argv: string[]): Promise<void> {
  const [command, a = "", b = ""] = argv;
  const paths = relayPaths();
  switch (command) {
    case "hook":
      runHook(a, b, await readStdin(), { paths, now: Date.now, readGit: (cwd) => readGit(cwd), dispatch });
      return;
    case "send":
      return send(paths);
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
      console.log(install(process.env.HOME || homedir(), { cli: SELF, runtime: process.execPath }).join("\n"));
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
if (argv[0] === "hook" || argv[0] === "send") {
  process.on("uncaughtException", () => process.exit(0));
  process.on("unhandledRejection", () => process.exit(0));
}

// A hook must never fail or print: errors are swallowed and the process exits 0. Only install and uninstall report theirs (exit 1).
main(argv)
  .catch((error: unknown) => {
    if (argv[0] === "install" || argv[0] === "uninstall") {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  })
  .finally(() => process.exit(process.exitCode ?? 0));
