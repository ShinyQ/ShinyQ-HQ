import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { createHQStore, STORE_KEY, type HQStore } from "@/store/useHQStore";
import type { Interactable } from "@/experience/interact/registry";
import type { RoomId } from "@/content/schema";

function memoryStorage(): StateStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

let storage: ReturnType<typeof memoryStorage>;
let store: HQStore;

beforeEach(() => {
  storage = memoryStorage();
  store = createHQStore(storage);
  store.getState().setPhase("explore");
});

describe("HQ store", () => {
  it("starts in boot on L1 with sound muted", () => {
    const fresh = createHQStore(memoryStorage()).getState();
    expect(fresh.phase).toBe("boot");
    expect(fresh.floor).toBe("L1");
    expect(fresh.sound).toBe(false);
    expect(fresh.firstVisit).toBe(true);
  });

  it("creates an elevator ride for up/down and explicit floors", () => {
    store.getState().requestElevator("up");
    expect(store.getState().ride).toEqual({ from: "L1", to: "L2", stage: "toDoor", t: 0 });
    expect(store.getState().phase).toBe("elevator");
  });

  it("retargets a ride that has not boarded yet", () => {
    store.getState().requestElevator("up");
    store.getState().requestElevator("up");
    expect(store.getState().ride?.to).toBe("L3");
    store.getState().requestElevator("RF");
    expect(store.getState().ride?.to).toBe("RF");
    store.getState().requestElevator("L1");
    expect(store.getState().ride).toBeNull();
    expect(store.getState().phase).toBe("explore");
  });

  it("ignores invalid or blocked elevator requests", () => {
    store.getState().requestElevator("down");
    expect(store.getState().ride).toBeNull();
    store.getState().requestElevator("L1");
    expect(store.getState().ride).toBeNull();

    store.getState().requestElevator("L3");
    store.getState().setRide({ from: "L1", to: "L3", stage: "moving", t: 0.1 });
    store.getState().requestElevator("RF");
    expect(store.getState().ride?.to).toBe("L3");

    const booting = createHQStore(memoryStorage());
    booting.getState().requestElevator("up");
    expect(booting.getState().ride).toBeNull();
  });

  it("arrives on a floor and returns to explore", () => {
    store.getState().requestElevator("L4");
    store.getState().arriveFloor("L4");
    expect(store.getState()).toMatchObject({ floor: "L4", ride: null, phase: "explore" });
  });

  it("cancels only rides still driving to the door", () => {
    store.getState().requestElevator("up");
    store.getState().cancelRide();
    expect(store.getState().ride).toBeNull();
  });

  it("finishes the intro and clears firstVisit", () => {
    store.getState().finishIntro();
    expect(store.getState()).toMatchObject({ phase: "explore", firstVisit: false });
  });

  it("dedupes visited rooms and opens rooms", () => {
    store.getState().openRoom("L3:voice-ai");
    store.getState().markVisited("L3:voice-ai");
    expect(store.getState().visited).toEqual(["L3:voice-ai"]);
    expect(store.getState().phase).toBe("room");
    store.getState().closeRoom();
    expect(store.getState().activeRoom).toBeNull();
  });

  it("opens rooms on a tab, keeps the tab and README per room, and resets them on a new room", () => {
    store.getState().openRoom("L3:voice-ai", "results");
    expect(store.getState().drawerTab).toBe("results");
    store.getState().toggleReadme();
    store.getState().openRoom("L3:voice-ai");
    expect(store.getState()).toMatchObject({ drawerTab: "results", readme: true });
    store.getState().openRoom("L3:fraud");
    expect(store.getState()).toMatchObject({ drawerTab: "overview", readme: false });
    store.getState().setDrawerTab("stack");
    expect(store.getState().drawerTab).toBe("stack");
    store.getState().closeRoom();
    expect(store.getState().readme).toBe(false);
  });

  it("enters and leaves the hologram view of the active room and blocks the elevator meanwhile", () => {
    store.getState().openHologram();
    expect(store.getState().phase).toBe("explore");
    store.getState().openRoom("L3:voice-ai");
    store.getState().openHologram();
    expect(store.getState().phase).toBe("hologram");
    store.getState().requestElevator("up");
    expect(store.getState().ride).toBeNull();
    store.getState().closeHologram();
    expect(store.getState()).toMatchObject({ phase: "room", activeRoom: "L3:voice-ai" });
    store.getState().openHologram();
    store.getState().closeRoom();
    expect(store.getState()).toMatchObject({ phase: "explore", activeRoom: null });
  });

  it("switches to the static phase when the tier drops to static", () => {
    store.getState().setTier("static");
    expect(store.getState()).toMatchObject({ tier: "static", phase: "static" });
  });

  it("recovers from the static tier to explore with the detected tier", () => {
    store.getState().requestElevator("up");
    store.getState().setTier("static");
    expect(store.getState().phase).toBe("static");
    store.getState().recover("lite");
    expect(store.getState()).toMatchObject({ tier: "lite", phase: "explore", ride: null, beam: null, picker: null });
  });

  it("persists only visited, firstVisit, locale and motion (the audio engine owns sound)", () => {
    store.getState().toggleSound();
    store.getState().setLocale("id");
    store.getState().finishIntro();
    store.getState().setRover({ x: 5 });
    const saved = JSON.parse(storage.data.get(STORE_KEY) ?? "{}");
    expect(Object.keys(saved.state).sort()).toEqual(["firstVisit", "locale", "motion", "visited"]);
    expect(saved.state).toMatchObject({ locale: "id", firstVisit: false });
  });

  it("rehydrates persisted settings", () => {
    store.getState().setLocale("id");
    store.getState().finishIntro();
    const again = createHQStore(storage).getState();
    expect(again.locale).toBe("id");
    expect(again.firstVisit).toBe(false);
  });

  it("resumes on a floor in explore", () => {
    const fresh = createHQStore(memoryStorage());
    fresh.getState().resume("L3", { x: -21, z: 0 });
    expect(fresh.getState()).toMatchObject({ floor: "L3", phase: "explore", rover: { x: -21, z: 0 } });
  });

  it("opens a pad picker only while exploring, and a new ride closes it", () => {
    store.getState().openPicker({ kind: "floor" });
    expect(store.getState().picker).toEqual({ kind: "floor" });
    store.getState().closePicker();
    expect(store.getState().picker).toBeNull();
    store.getState().openRoom("L3:voice-ai-contact-center");
    store.getState().openPicker({ kind: "year", from: 2021 });
    expect(store.getState().picker).toBeNull();
    store.getState().closeRoom();
    store.getState().openPicker({ kind: "year", from: 2021 });
    expect(store.getState().picker).toEqual({ kind: "year", from: 2021 });
    store.getState().requestElevator("L3");
    expect(store.getState().ride?.to).toBe("L3");
    expect(store.getState().picker).toBeNull();
  });

  it("holds the teleport beam and refuses a picker while it runs", () => {
    const beam = { pad: "teleport:2023", from: { x: 0, z: 0 }, to: { x: 140, z: -0.5 }, heading: Math.PI / 2, t: 0, jumped: false };
    store.getState().setBeam(beam);
    expect(store.getState().beam).toEqual(beam);
    store.getState().openPicker({ kind: "floor" });
    expect(store.getState().picker).toBeNull();
    store.getState().setBeam(null);
    expect(store.getState().beam).toBeNull();
    expect(storage.data.get(STORE_KEY) ?? "").not.toContain("picker");
  });

  it("holds the point-and-go target, ignores repeats and never persists it", () => {
    const item: Interactable = {
      id: "L3:door:demo",
      floor: "L3",
      kind: "door",
      label: "Demo",
      at: { x: 0, z: 0 },
      bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
      action: { type: "open-room", room: "L3:demo" },
    };
    expect(store.getState().hover).toBeNull();
    expect(store.getState().pointHint).toBe(false);
    const seen: (string | null)[] = [];
    const off = store.subscribe((s, prev) => {
      if (s.hover !== prev.hover) seen.push(s.hover ? `${s.hover.item.id}/${s.hover.via}` : null);
    });
    store.getState().setHover({ item, via: "pointer" });
    store.getState().setHover({ item, via: "pointer" });
    store.getState().setHover({ item, via: "tap" });
    store.getState().setHover(null);
    store.getState().setHover(null);
    off();
    expect(seen).toEqual(["L3:door:demo/pointer", "L3:door:demo/tap", null]);
    store.getState().setPointHint(true);
    expect(store.getState().pointHint).toBe(true);
    store.getState().setHover({ item, via: "tap" });
    expect(storage.data.get(STORE_KEY) ?? "").not.toMatch(/hover|pointHint|L3:door:demo/);
  });

  it("ignores a rover patch that matches the mirror (the 10 Hz sync while parked)", () => {
    let sets = 0;
    store.subscribe(() => (sets += 1));
    const { x, z, heading } = store.getState().rover;
    store.getState().setRover({ x, z, heading, speed: 0, face: "idle", status: undefined });
    store.getState().setRover({ x: x + 5e-5 });
    expect(sets).toBe(0);
    store.getState().setRover({ x: x + 0.01 });
    store.getState().setRover({ status: "to L2" });
    expect(sets).toBe(2);
  });

  it("writes localStorage only when visited, firstVisit, locale or motion change", () => {
    const counted = memoryStorage();
    let writes = 0;
    const write = counted.setItem;
    counted.setItem = (key, value) => {
      writes += 1;
      return write(key, value);
    };
    const st = createHQStore(counted);
    st.getState().setPhase("explore");
    const base = writes;
    for (let i = 1; i <= 20; i++) st.getState().setRover({ x: i });
    st.getState().setDevice({ coarse: true });
    st.getState().setHover(null);
    expect(writes).toBe(base);
    st.getState().markVisited("L3:a" as RoomId);
    st.getState().setLocale("id");
    expect(writes).toBe(base + 2);
    expect(JSON.parse(counted.data.get(STORE_KEY)!).state).toEqual({ visited: ["L3:a"], firstVisit: true, locale: "id", motion: "system" });
  });
});

describe("Tech Reactor slice", () => {
  const azure = { slug: "azure-openai", name: "Azure OpenAI", ring: "azure" as const, count: 2, pods: ["a", "b"] };

  it("starts on the AI ring with nothing selected", () => {
    expect(store.getState().reactor).toEqual({ ring: "ai", tech: null, spin: 0 });
  });

  it("selects a tech (switching the ring) and clears it", () => {
    store.getState().selectReactorTech(azure);
    expect(store.getState().reactor).toMatchObject({ ring: "azure", tech: azure });
    store.getState().setReactorRing("data");
    expect(store.getState().reactor).toMatchObject({ ring: "data", tech: azure });
    store.getState().clearReactorTech();
    expect(store.getState().reactor.tech).toBeNull();
    expect(store.getState().reactor.ring).toBe("data");
  });

  it("counts Surprise me spins and never persists", () => {
    store.getState().spinReactor();
    store.getState().spinReactor();
    expect(store.getState().reactor.spin).toBe(2);
    store.getState().selectReactorTech(azure);
    expect(storage.data.get(STORE_KEY) ?? "").not.toContain("azure-openai");
  });
});
