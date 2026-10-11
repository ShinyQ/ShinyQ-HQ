import { describe, expect, it, vi } from "vitest";
import type { MissionStep } from "@/content/schema";
import type { MissionStatus } from "@/experience/missions/host";
import { createWalk, filterStops, markPromptSeen, promptSeen, WALK_STORAGE_PREFIX, type WalkDefinition, type WalkHost, type WalkStorage } from "@/experience/missions/walk";
import { careerWalk, labsWalk, walkFloorsEnabled } from "@/experience/missions/walks";
import type { CareerData, LabPod } from "@/experience/types";

const memory = (): WalkStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
};

const DEF: WalkDefinition = {
  id: "test",
  floor: "L2",
  stops: [
    { id: "L2:a", to: "L2:a", room: "L2:a", title: "A", tags: ["job"] },
    { id: "L2:b", to: "L2:b", room: "L2:b", title: "B", tags: ["award"] },
    { id: "L2:c", to: "L2:c", room: "L2:c", title: "C", tags: ["job"] },
    { id: "dir", to: { x: 1, z: 2 }, palette: "pods", title: "More", tags: ["job", "award"] },
  ],
  filters: [
    { id: "job", label: "Employment" },
    { id: "award", label: "Awards" },
  ],
};

/** Host double: every leg resolves when the test settles it (done or cancelled). */
function host() {
  const legs: { id: string; steps: MissionStep[]; settle: (s: MissionStatus) => void }[] = [];
  const h: WalkHost & { legs: typeof legs } = {
    legs,
    run: (id, steps) =>
      new Promise<MissionStatus>((resolve) => {
        // A new leg cancels the previous one, like the mission runner does.
        legs.at(-1)?.settle("cancelled");
        legs.push({ id, steps, settle: resolve });
      }),
    cancel: vi.fn(() => legs.at(-1)?.settle("cancelled")),
  };
  return h;
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("createWalk", () => {
  it("drives to the first stop, opens it on arrival and marks it visited", async () => {
    const h = host();
    const storage = memory();
    const walk = createWalk(DEF, h, { storage });
    const started = walk.start();
    expect(walk.state.status).toBe("driving");
    expect(walk.state.stop?.id).toBe("L2:a");
    expect(h.legs[0].steps).toEqual([
      { kind: "elevator", floor: "L2" },
      { kind: "drive", to: "L2:a" },
      { kind: "open", room: "L2:a" },
    ]);
    h.legs[0].settle("done");
    await started;
    expect(walk.state.status).toBe("arrived");
    expect(walk.state.visited).toEqual(["L2:a"]);
    expect(JSON.parse(storage.data.get(`${WALK_STORAGE_PREFIX}test`)!)).toMatchObject({ stop: "L2:a", visited: ["L2:a"], done: false });
  });

  it("steps with next and prev, and finishes after the last stop", async () => {
    const h = host();
    const walk = createWalk(DEF, h, { storage: memory() });
    void walk.go(2);
    h.legs[0].settle("done");
    await flush();
    void walk.next();
    expect(walk.state.stop?.id).toBe("dir");
    // Directory stops drive without opening anything.
    expect(h.legs[1].steps).toHaveLength(2);
    h.legs[1].settle("done");
    await flush();
    void walk.prev();
    expect(walk.state.index).toBe(2);
    h.legs[2].settle("done");
    await flush();
    void walk.next();
    h.legs[3].settle("done");
    await flush();
    await walk.next();
    expect(walk.state.status).toBe("done");
  });

  it("pauses when a leg is cancelled (manual input) and resumes at the same stop", async () => {
    const h = host();
    const walk = createWalk(DEF, h, { storage: memory() });
    void walk.start();
    h.legs[0].settle("cancelled");
    await flush();
    expect(walk.state.status).toBe("paused");
    void walk.resume();
    expect(walk.state.status).toBe("driving");
    expect(h.legs[1].steps[1]).toEqual({ kind: "drive", to: "L2:a" });
  });

  it("ignores the cancelled result of a superseded leg", async () => {
    const h = host();
    const walk = createWalk(DEF, h, { storage: memory() });
    void walk.start();
    void walk.next();
    await flush();
    expect(walk.state.status).toBe("driving");
    expect(walk.state.stop?.id).toBe("L2:b");
  });

  it("pause cancels the autopilot; end leaves the walk but keeps progress", async () => {
    const h = host();
    const storage = memory();
    const walk = createWalk(DEF, h, { storage });
    void walk.go(1);
    walk.pause();
    expect(h.cancel).toHaveBeenCalledTimes(1);
    expect(walk.state.status).toBe("paused");
    walk.end();
    expect(walk.state.status).toBe("idle");
    expect(walk.saved()?.stop).toBe("L2:b");
    // A new controller (next visit) resumes at the saved stop.
    const again = createWalk(DEF, host(), { storage });
    void again.start();
    expect(again.state.stop?.id).toBe("L2:b");
    void again.start({ restart: true });
    expect(again.state.stop?.id).toBe("L2:a");
  });

  it("filters stops and keeps the current stop when it matches", async () => {
    expect(filterStops(DEF.stops, "award").map((s) => s.id)).toEqual(["L2:b", "dir"]);
    const h = host();
    const walk = createWalk(DEF, h, { storage: memory() });
    void walk.go(2);
    h.legs[0].settle("done");
    await flush();
    await walk.setFilter("job");
    expect(walk.state.total).toBe(3);
    expect(walk.state.stop?.id).toBe("L2:c");
    await walk.setFilter("award");
    // C is not an award: the walk moves to the next award stop in walk order.
    expect(walk.state.stop?.id).toBe("dir");
    await walk.setFilter("nope");
    expect(walk.state.filter).toBeNull();
  });

  it("open drives first when the rover is not at the stop", async () => {
    const h = host();
    const walk = createWalk({ ...DEF, autoOpen: false }, h, { storage: memory() });
    void walk.start();
    expect(h.legs[0].steps).toHaveLength(2);
    h.legs[0].settle("done");
    await flush();
    void walk.open();
    expect(h.legs[1]).toMatchObject({ id: "walk:test:open", steps: [{ kind: "open", room: "L2:a" }] });
  });

  it("survives broken storage", () => {
    const storage: WalkStorage = {
      getItem: () => "{not json",
      setItem: () => {
        throw new Error("quota");
      },
    };
    const walk = createWalk(DEF, host(), { storage });
    expect(walk.state.index).toBe(0);
    expect(() => walk.end()).not.toThrow();
  });
});

describe("first-visit prompt", () => {
  it("is remembered per floor", () => {
    const storage = memory();
    expect(promptSeen("L2", storage)).toBe(false);
    markPromptSeen("L2", storage);
    markPromptSeen("L2", storage);
    expect(promptSeen("L2", storage)).toBe(true);
    expect(promptSeen("L3", storage)).toBe(false);
    expect(storage.data.get("hq:walk-prompt")).toBe('["L2"]');
  });
});

describe("walk definitions", () => {
  const career: CareerData = {
    years: [
      { year: 2019, awards: 0, entries: [{ slug: "a", type: "milestone", role: "Start", org: "Org", period: "2016", prologue: true }] },
      { year: 2021, awards: 1, entries: [{ slug: "b", type: "job", role: "Engineer", org: "Co", period: "2021", prologue: false }] },
    ],
    sideProjects: [],
    repos: [],
    models: [],
  };
  const types = { job: "Employment", freelance: "Freelance", education: "Education", award: "Awards", milestone: "Milestone" };

  it("walks the career rooms oldest first, then the Workshop", () => {
    const walk = careerWalk(career, { types, workshop: "Workshop", workshopSub: "Side projects" });
    expect(walk.stops.map((s) => s.id)).toEqual(["L2:a", "L2:b", "L2:workshop"]);
    expect(walk.stops[1]).toMatchObject({ group: "2021", subtitle: "Co · 2021", tags: ["job"] });
    expect(walk.filters?.map((f) => f.id)).toEqual(["job", "freelance", "education", "award", "milestone"]);
    expect(filterStops(walk.stops, "award").map((s) => s.id)).toEqual(["L2:workshop"]);
  });

  it("marks prologue entries, which sit in the 2019 plaza like the Page View timeline", () => {
    const walk = careerWalk(career, { types, workshop: "Workshop", workshopSub: "Side projects", prologue: "Prologue" });
    expect(walk.stops[0]).toMatchObject({ group: "2019", subtitle: "Prologue · Org · 2016" });
    expect(walk.stops[1].subtitle).toBe("Co · 2021");
  });

  it("tours hero pods, then featured pods, then the directories", () => {
    const pod = (slug: string, tier: LabPod["tier"], wing: LabPod["wing"], order: number): LabPod => ({
      id: slug,
      slug,
      title: slug,
      tier,
      wing,
      order,
      accent: "cyan",
      hologram: "graph",
      hasHologramView: false,
    });
    const pods = [pod("f1", "featured", "ai", 3), pod("h2", "hero", "ai", 0), pod("h1", "hero", "software", 0), pod("l1", "listed", "ai", 9), pod("h3", "hero", "software", 1)];
    const walk = labsWalk(pods, { wings: { software: "Product Engineering", ai: "AI Engineering" }, more: "More projects here", moreSub: "" });
    expect(walk.stops.map((s) => s.id)).toEqual(["L3:h1", "L3:h3", "L3:h2", "L3:f1", "L3:directory:software", "L3:directory:ai"]);
    expect(walk.stops.at(-1)).toMatchObject({ palette: "pods" });
    expect(walk.stops.at(-1)?.room).toBeUndefined();
    const placedOnly = labsWalk(pods, { wings: { software: "S", ai: "A" }, more: "", moreSub: "" }, new Set(["h1"]));
    expect(placedOnly.stops[0].id).toBe("L3:h1");
    expect(placedOnly.stops).toHaveLength(3);
  });

  it("offers walks on ready floors, or everywhere with ?walk=on", () => {
    expect(walkFloorsEnabled([], "")).toEqual([]);
    expect(walkFloorsEnabled(["L2"], "?tier=lite")).toEqual(["L2"]);
    expect(walkFloorsEnabled([], "?walk=on")).toContain("L3");
    expect(walkFloorsEnabled(["L2"], "?walk=off")).toEqual([]);
  });
});
