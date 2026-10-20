import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readdirSync, readFileSync, readSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyHelper, helperCount } from "../../tools/office-relay/src/helpers";
import { helpersFile, LOCK_BUDGET_MS, LOCK_STALE_MS, readHelpers, relayPaths, updateHelpers, writeHelpers, type RelayPaths } from "../../tools/office-relay/src/store";

describe("relayPaths", () => {
  it("falls back to the OS home when HOME is missing or empty, never the working directory", () => {
    for (const env of [{}, { HOME: "" }]) {
      const paths = relayPaths(env);
      expect(paths.home).toBe(path.join(homedir(), ".office-relay"));
      expect(paths.pause).toBe(path.join(homedir(), ".office-pause"));
      expect(path.isAbsolute(paths.log)).toBe(true);
    }
  });

  it("uses HOME and OFFICE_RELAY_HOME when set", () => {
    expect(relayPaths({ HOME: "/h" })).toMatchObject({ home: "/h/.office-relay", pause: "/h/.office-pause", log: "/h/.office-relay/relay.log" });
    expect(relayPaths({ HOME: "/h", OFFICE_RELAY_HOME: "/r" })).toMatchObject({ home: "/r", pause: "/h/.office-pause", config: "/r/config.json" });
  });
});

describe("helpers file: atomic writes and the lock", () => {
  const CHILD = path.resolve("tests/relay/helpers-race-child.ts");
  const SESSION = "a".repeat(64);
  const BASE_ENV = { PATH: process.env.PATH ?? "", NODE_ENV: "test" as const };

  function setup() {
    const home = mkdtempSync(path.join(tmpdir(), "relay-store-"));
    const sync = mkdtempSync(path.join(tmpdir(), "relay-sync-"));
    const paths = relayPaths({ HOME: home });
    return { home, sync, paths, file: helpersFile(paths, SESSION), lock: `${helpersFile(paths, SESSION)}.lock` };
  }
  const child = (role: string, home: string, sync: string) => spawn("bun", [CHILD, role, home, SESSION, sync], { env: BASE_ENV, stdio: "ignore" });
  const exited = (c: ChildProcess) => new Promise<number | null>((resolve) => c.on("exit", resolve));
  const twoHelpers = (paths: RelayPaths) => writeHelpers(paths, SESSION, applyHelper(applyHelper({ ids: {} }, "start", null, Date.now()), "start", null, Date.now()));

  it("writes through a temp file: mode 0600, no temp or lock file left", () => {
    const { paths, file } = setup();
    let lockedInside = false;
    updateHelpers(paths, SESSION, (s) => {
      lockedInside = existsSync(`${file}.lock`);
      return applyHelper(s, "start", "x", Date.now());
    });
    expect(lockedInside).toBe(true);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(readdirSync(paths.sessions)).toEqual([path.basename(file)]);
  });

  it("serializes two processes: a stop that arrives inside another stop's critical section waits and applies on top", async () => {
    for (let round = 0; round < 3; round++) {
      const { home, sync, paths, file } = setup();
      twoHelpers(paths);
      const hold = child("hold", home, sync);
      const join = child("join", home, sync);
      expect(await Promise.all([exited(hold), exited(join)])).toEqual([0, 0]);
      // Without the lock the join reads the old two helpers and the last writer leaves a phantom one.
      expect(helperCount(readHelpers(paths, SESSION), Date.now())).toBe(0);
      expect(existsSync(`${file}.lock`)).toBe(false);
    }
  }, 20_000);

  it("a reader in another process never sees a truncated or partial file", async () => {
    const { home, sync, paths, file } = setup();
    writeHelpers(paths, SESSION, { ids: {} });
    const writer = child("write", home, sync);
    const done = exited(writer);
    let reads = 0;
    let torn = 0;
    const deadline = Date.now() + 10_000;
    while (!existsSync(path.join(sync, "done")) && Date.now() < deadline) {
      // A truncate-then-write shows size 0 between the two calls (cheap to poll); every 50th poll also reads the
      // content, which must be complete (an empty or partial file does not end with the state's closing braces).
      reads++;
      if (statSync(file).size === 0) torn++;
      if (reads % 50 === 0) {
        const raw = readFileSync(file, "utf8");
        if (!raw.startsWith('{"ids":{') || !raw.endsWith("}}")) torn++;
      }
    }
    expect(await done).toBe(0);
    expect(reads).toBeGreaterThan(100);
    expect(torn).toBe(0);
    expect(JSON.parse(readFileSync(file, "utf8"))).toHaveProperty("ids");
  }, 20_000);

  it("replaces the file whole: a reader that opened it before a write still reads the complete old state", () => {
    const { paths, file } = setup();
    const a = applyHelper({ ids: {} }, "start", "a", Date.now());
    writeHelpers(paths, SESSION, a);
    const before = readFileSync(file, "utf8");
    const fd = openSync(file, "r");
    try {
      writeHelpers(paths, SESSION, applyHelper(a, "start", "b", Date.now()));
      const buf = Buffer.alloc(before.length + 64);
      expect(buf.subarray(0, readSync(fd, buf, 0, buf.length, 0)).toString("utf8")).toBe(before);
    } finally {
      closeSync(fd);
    }
    expect(helperCount(readHelpers(paths, SESSION), Date.now())).toBe(2);
  });

  it("removes a stale lock left by a dead hook and takes the lock", () => {
    const { paths, lock } = setup();
    mkdirSync(paths.sessions, { recursive: true });
    writeFileSync(lock, "");
    const old = (Date.now() - LOCK_STALE_MS - 4000) / 1000;
    utimesSync(lock, old, old);
    let lockedInside = false;
    const t = performance.now();
    updateHelpers(paths, SESSION, (s) => {
      lockedInside = existsSync(lock) && statSync(lock).mtimeMs > Date.now() - LOCK_STALE_MS;
      return applyHelper(s, "start", "x", Date.now());
    });
    expect(performance.now() - t).toBeLessThan(LOCK_BUDGET_MS);
    expect(lockedInside).toBe(true);
    expect(existsSync(lock)).toBe(false);
    expect(helperCount(readHelpers(paths, SESSION), Date.now())).toBe(1);
  });

  it("goes on unlocked after a bounded wait when a live lock is held, and leaves that lock alone", () => {
    const { paths, lock } = setup();
    mkdirSync(paths.sessions, { recursive: true });
    writeFileSync(lock, "");
    const t = performance.now();
    updateHelpers(paths, SESSION, (s) => applyHelper(s, "start", "x", Date.now()));
    const waited = performance.now() - t;
    expect(waited).toBeGreaterThanOrEqual(LOCK_BUDGET_MS - 1);
    expect(waited).toBeLessThan(LOCK_BUDGET_MS + 20);
    expect(existsSync(lock)).toBe(true);
    expect(helperCount(readHelpers(paths, SESSION), Date.now())).toBe(1);
  });
});
