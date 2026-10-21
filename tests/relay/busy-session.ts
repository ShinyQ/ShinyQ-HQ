// A busy Copilot session for tests/relay/throttle.test.ts, built from the fixtures. The shape follows the owner's relay
// log of 2026-10-21 (event names, mapped states and timing only; the log holds no payload text): a tool call is a
// `preToolUse`, a `permissionRequest` about 30 ms later (a permission check) and a `postToolUse`; most calls are shell
// commands, whose pre maps to working (or reviewing, testing) and whose post maps to thinking, so the desk flips twice
// per command; reads come in parallel groups; the model pauses 1 to 20 s between rounds.
import type { OfficeAgent } from "@/lib/office/protocol";
import { HOOK_FIXTURES } from "./fixtures";

export interface HookCall {
  at: number;
  agent: OfficeAgent;
  event: string;
  payload: Record<string, unknown>;
  /** A main-session event that moves the desk (not a permission check, an unmapped preToolUse or a helper's own event). */
  main: boolean;
}

const cp = HOOK_FIXTURES.copilot;

/** mulberry32: a small seeded PRNG, so the session is the same on every run. */
function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const READS = ["view", "grep", "glob"];
const EDITS = ["edit", "create"];
const COMMANDS = ["bun run test", "bunx vitest run tests/relay", "git status --short", "git commit -m wip", "bun run build", "rg throttle src", "cat package.json", "ls tools", "bun scripts/ci-plan.ts", "python3 scan.py", "gh run watch 1 --exit-status"];

/**
 * About `events` hook calls over roughly ten minutes from `start`: a prompt, rounds of tool calls, one background helper
 * with its own events, one real permission prompt, a stop and a new prompt in the middle, and a final stop.
 */
export function busySession(start: number, events = 300, seed = 20_261_020): HookCall[] {
  const rnd = prng(seed);
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];
  const calls: HookCall[] = [];
  let t = start;
  const push = (at: number, event: string, payload: Record<string, unknown>, main: boolean) => calls.push({ at: Math.round(at), agent: "copilot", event, payload, main });
  const tool = (at: number, toolName: string, toolArgs: Record<string, unknown>, mapped: boolean) => {
    push(at, "preToolUse", { ...cp.preToolUse, toolName, toolArgs }, mapped);
    push(at + 30, "permissionRequest", { ...cp.permissionRequest, toolName }, false);
  };
  const done = (at: number, toolName: string, toolArgs: Record<string, unknown>) => push(at, "postToolUse", { ...cp.postToolUseView, toolName, toolArgs }, true);

  push(t, "userPromptSubmitted", cp.userPromptSubmitted, true);
  t += 2000 + rnd() * 3000;
  let helperUntil = 0;
  let nextHelper = 0;
  for (let round = 0; calls.length < events; round++) {
    if (round === 20) {
      push(t, "subagentStart", cp.subagentStart, false);
      helperUntil = t + 90_000;
      nextHelper = t + 1500;
    }
    // The helper works in the background: its own pre, check and post every few seconds, under its own session id.
    while (helperUntil && nextHelper < t) {
      push(nextHelper, "preToolUse", cp.preToolUseInHelper, false);
      push(nextHelper + 30, "permissionRequest", cp.permissionRequestInHelper, false);
      push(nextHelper + 400, "postToolUse", cp.preToolUseInHelper, false);
      nextHelper += 2500 + rnd() * 3000;
      if (nextHelper >= helperUntil) {
        push(helperUntil, "subagentStop", cp.subagentStop, false);
        helperUntil = 0;
      }
    }
    if (round === 35) {
      // A real prompt: the shell waits on the owner for 8 s.
      tool(t, "bash", { command: "git push origin HEAD" }, true);
      push(t + 600, "notification", cp.notification, true);
      t += 8000;
      done(t, "bash", { command: "git push origin HEAD" });
    } else if (round === 50) {
      // The turn ends; the owner answers 25 s later.
      push(t, "agentStop", cp.agentStop, true);
      t += 25_000;
      push(t, "userPromptSubmitted", cp.userPromptSubmitted, true);
    } else {
      const kind = rnd();
      if (kind < 0.25) {
        const n = 1 + Math.floor(rnd() * 3);
        const names = Array.from({ length: n }, () => pick(READS));
        names.forEach((name, i) => tool(t + i * 60, name, { path: "src/x.ts" }, true));
        t += n * 60 + 50 + rnd() * 250;
        names.forEach((name, i) => done(t + i * 40, name, { path: "src/x.ts" }));
        t += n * 40;
      } else if (kind < 0.4) {
        const name = pick(EDITS);
        tool(t, name, { path: "src/x.ts" }, true);
        t += 100 + rnd() * 200;
        done(t, name, { path: "src/x.ts" });
      } else {
        // The shell: most of the log's beats, a working (or reviewing, testing) pre and a thinking post per command.
        const command = pick(COMMANDS);
        tool(t, "bash", { command }, true);
        t += pick([300, 1000, 2000, 5000, 15_000]) * (0.5 + rnd());
        done(t, "bash", { command });
      }
    }
    t += pick([1500, 2500, 4000, 6000, 9000, 14_000]) * (0.6 + rnd() * 0.8);
  }
  push(t, "agentStop", cp.agentStop, true);
  return calls.sort((a, b) => a.at - b.at);
}
