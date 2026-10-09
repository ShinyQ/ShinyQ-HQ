import { describe, expect, it, vi } from "vitest";
import { getContent } from "@/content/load";
import type { DrawerTab, FloorId, LocalizedText, RoomId } from "@/content/schema";
import type { MissionHost, PaletteFilter, StepContext, Vec2 } from "@/experience/missions/host";
import { buildRoomCatalog } from "@/experience/missions/rooms";
import { createMissionRunner, type MissionState } from "@/experience/missions/runner";
import { structuralLabels } from "@/hud/index-data";

const content = getContent();
const missions = content.missions;
const rooms = buildRoomCatalog(content, structuralLabels());

type Call = string;

function fakeHost(overrides: Partial<MissionHost> = {}) {
  const calls: Call[] = [];
  const signals: AbortSignal[] = [];
  const record = (call: Call, ctx: StepContext) => {
    calls.push(call);
    signals.push(ctx.signal);
    return Promise.resolve();
  };
  const finish = vi.fn();
  const host: MissionHost = {
    isStatic: false,
    elevator: (floor: FloorId, ctx) => record(`elevator ${floor}`, ctx),
    driveTo: (to: RoomId | Vec2, ctx) => record(`drive ${typeof to === "string" ? to : `${to.x},${to.z}`}`, ctx),
    openRoom: (room: RoomId, tab: DrawerTab | undefined, ctx) => record(`open ${room}${tab ? ` ${tab}` : ""}`, ctx),
    say: (text: LocalizedText, ms: number | undefined, ctx) => record(`say ${text.en}${ms ? ` ${ms}` : ""}`, ctx),
    openPalette: (filter: PaletteFilter | undefined, ctx) => record(`palette ${filter ?? ""}`.trim(), ctx),
    finish,
    ...overrides,
  };
  return { host, calls, signals, finish };
}

/** A promise the test resolves by hand, to hold the runner inside a step. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("mission runner: catalog", () => {
  const expected: Record<string, Call[]> = {
    "best-swe": ["elevator L3", "drive L3:digital-banking-integrations", "open L3:digital-banking-integrations overview"],
    "best-ai": ["elevator L3", "drive L3:voice-ai-contact-center", "open L3:voice-ai-contact-center overview"],
    journey: ["elevator L2", "drive L2:prologue-2016", "say drive or swipe forward in time 2400"],
    projects: ["elevator L3", "palette pods"],
    hire: ["elevator RF", "drive RF:contact", "open RF:contact"],
    cv: ["elevator RF", "drive RF:cv", "open RF:cv"],
    blog: ["elevator L4", "drive L4:the-sun-the-moon-and-the-dark-sea", "open L4:the-sun-the-moon-and-the-dark-sea"],
  };

  it("covers every mission in the content catalog", () => {
    expect(missions.map((m) => m.id).sort()).toEqual([...Object.keys(expected), "surprise"].sort());
  });

  for (const [id, sequence] of Object.entries(expected)) {
    it(`runs ${id}`, async () => {
      const { host, calls, finish } = fakeHost();
      const runner = createMissionRunner({ host, missions, rooms });
      await expect(runner.start(id)).resolves.toBe("done");
      expect(calls).toEqual(sequence);
      expect(runner.state).toEqual({ missionId: id, step: sequence.length - 1, stepCount: sequence.length, status: "done" });
      expect(finish).toHaveBeenCalledExactlyOnceWith("done", id);
    });
  }

  it("runs surprise as elevator, drive and open of a weighted unvisited room", async () => {
    const { host, calls } = fakeHost();
    const runner = createMissionRunner({ host, missions, rooms, random: () => 0, visited: () => [] });
    await expect(runner.start("surprise")).resolves.toBe("done");
    const first = rooms.find((r) => r.surpriseWeight > 0)!;
    expect(calls).toEqual([`elevator ${first.floor}`, `drive ${first.id}`, `open ${first.id}`]);
  });

  it("does not surprise with a visited room", async () => {
    const first = rooms.find((r) => r.surpriseWeight > 0)!;
    const { host, calls } = fakeHost();
    const runner = createMissionRunner({ host, missions, rooms, random: () => 0, visited: () => [first.id] });
    await runner.start("surprise");
    expect(calls).not.toContain(`open ${first.id}`);
    expect(calls).toHaveLength(3);
  });

  it("rejects unknown missions without touching the host", async () => {
    const { host, calls } = fakeHost();
    const runner = createMissionRunner({ host, missions, rooms });
    await expect(runner.start("nope")).rejects.toThrow(/Unknown mission/);
    expect(calls).toEqual([]);
    expect(runner.state.status).toBe("idle");
  });
});

describe("mission runner: control", () => {
  it("reports running, then done, to subscribers", async () => {
    const { host } = fakeHost();
    const runner = createMissionRunner({ host, missions, rooms });
    const seen: MissionState[] = [];
    const unsubscribe = runner.subscribe((s) => seen.push(s));
    await runner.start("hire");
    unsubscribe();
    expect(seen[0]).toMatchObject({ missionId: "hire", step: 0, status: "running" });
    expect(seen.map((s) => s.step)).toEqual([0, 1, 2, 2]);
    expect(seen.at(-1)?.status).toBe("done");
  });

  it("cancels mid-step: aborts the signal, skips later steps and resolves cancelled", async () => {
    const gate = deferred();
    const { host, calls, signals, finish } = fakeHost({
      driveTo: (to, ctx) => {
        calls.push(`drive ${String(to)}`);
        signals.push(ctx.signal);
        return gate.promise;
      },
    });
    const runner = createMissionRunner({ host, missions, rooms });
    const run = runner.start("best-ai");
    await vi.waitFor(() => expect(calls).toHaveLength(2));
    runner.cancel();
    expect(runner.state.status).toBe("cancelled");
    await expect(run).resolves.toBe("cancelled");
    expect(signals[1].aborted).toBe(true);
    gate.resolve();
    await Promise.resolve();
    expect(calls).toEqual(["elevator L3", "drive L3:voice-ai-contact-center"]);
    expect(finish).toHaveBeenCalledExactlyOnceWith("cancelled", "best-ai");
  });

  it("cancel is a no-op when idle or finished", async () => {
    const { host, finish } = fakeHost();
    const runner = createMissionRunner({ host, missions, rooms });
    runner.cancel();
    expect(runner.state.status).toBe("idle");
    await runner.start("cv");
    runner.cancel();
    expect(runner.state.status).toBe("done");
    expect(finish).toHaveBeenCalledTimes(1);
  });

  it("starting a new mission cancels the running one", async () => {
    const gate = deferred();
    let held = true;
    const { host, calls, finish } = fakeHost({
      elevator: (floor, ctx) => {
        calls.push(`elevator ${floor}`);
        void ctx;
        return held ? gate.promise : Promise.resolve();
      },
    });
    const runner = createMissionRunner({ host, missions, rooms });
    const first = runner.start("blog");
    held = false;
    const second = runner.start("hire");
    await expect(first).resolves.toBe("cancelled");
    await expect(second).resolves.toBe("done");
    gate.resolve();
    expect(calls).toEqual(["elevator L4", "elevator RF", "drive RF:contact", "open RF:contact"]);
    expect(finish.mock.calls).toEqual([
      ["cancelled", "blog"],
      ["done", "hire"],
    ]);
    expect(runner.state).toMatchObject({ missionId: "hire", status: "done" });
  });

  it("treats a failing host step as cancelled", async () => {
    const { host, calls } = fakeHost({ openRoom: () => Promise.reject(new Error("no drawer")) });
    const runner = createMissionRunner({ host, missions, rooms });
    await expect(runner.start("hire")).resolves.toBe("cancelled");
    expect(calls).toEqual(["elevator RF", "drive RF:contact"]);
    expect(runner.state.status).toBe("cancelled");
  });

  it("goTo runs elevator, drive and open for any room", async () => {
    const { host, calls } = fakeHost();
    const runner = createMissionRunner({ host, missions, rooms });
    await expect(runner.goTo("L2:jenius-2024", "results")).resolves.toBe("done");
    expect(calls).toEqual(["elevator L2", "drive L2:jenius-2024", "open L2:jenius-2024 results"]);
    expect(runner.state.missionId).toBe("goto:L2:jenius-2024");
  });

  it("runSteps runs an ad hoc sequence such as a year jump", async () => {
    const { host, calls } = fakeHost();
    const runner = createMissionRunner({ host, missions, rooms });
    await runner.runSteps("year:2024", [
      { kind: "elevator", floor: "L2" },
      { kind: "drive", to: { x: 4, z: 0 } },
    ]);
    expect(calls).toEqual(["elevator L2", "drive 4,0"]);
  });
});
