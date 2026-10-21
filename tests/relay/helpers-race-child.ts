// A second hook process for tests/relay/store.test.ts (run with bun; not a test file itself).
//   hold <home> <session> <sync>: waits for <sync>/ready, then applies a stop that sits inside the critical section
//     for 5 ms after writing <sync>/inside
//   join <home> <session> <sync>: writes <sync>/ready, waits for <sync>/inside, then applies a stop
//   write <home> <session> <sync>: rewrites the helpers file 1000 times (about 90 KB each), then writes <sync>/done
// An optional fifth argument is the lock budget (ms) for `updateHelpers`.
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";
import { applyHelper, type HelperState } from "../../tools/office-relay/src/helpers";
import { relayPaths, updateHelpers, writeHelpers } from "../../tools/office-relay/src/store";

const [role, home, session, sync, budgetArg] = process.argv.slice(2);
const budget = budgetArg ? Number(budgetArg) : undefined;
const paths = relayPaths({ HOME: home });
const now = Date.now();
const sleeper = new Int32Array(new SharedArrayBuffer(4));
const stop = (s: HelperState) => applyHelper(s, "stop", null, now);
const waitFor = (name: string) => {
  const deadline = Date.now() + 5000;
  while (!existsSync(path.join(sync, name)) && Date.now() < deadline) Atomics.wait(sleeper, 0, 0, 0.05);
};

if (role === "hold") {
  waitFor("ready");
  updateHelpers(paths, session, (s) => {
    writeFileSync(path.join(sync, "inside"), "");
    Atomics.wait(sleeper, 0, 0, 5);
    return stop(s);
  }, budget);
} else if (role === "join") {
  writeFileSync(path.join(sync, "ready"), "");
  waitFor("inside");
  updateHelpers(paths, session, stop, budget);
} else if (role === "write") {
  const big = (n: number): HelperState => ({ ids: Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`${n}`.padStart(28, "0") + `${i}`.padStart(4, "0"), now + i])) });
  for (let n = 0; n < 1000; n++) writeHelpers(paths, session, big(n));
  writeFileSync(path.join(sync, "done"), "");
}
