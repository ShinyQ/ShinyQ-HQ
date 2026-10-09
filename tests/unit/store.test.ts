import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { createHQStore, STORE_KEY, type HQStore } from "@/store/useHQStore";

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

  it("switches to the static phase when the tier drops to static", () => {
    store.getState().setTier("static");
    expect(store.getState()).toMatchObject({ tier: "static", phase: "static" });
  });

  it("persists only visited, firstVisit and locale (the audio engine owns sound)", () => {
    store.getState().toggleSound();
    store.getState().setLocale("id");
    store.getState().finishIntro();
    store.getState().setRover({ x: 5 });
    const saved = JSON.parse(storage.data.get(STORE_KEY) ?? "{}");
    expect(Object.keys(saved.state).sort()).toEqual(["firstVisit", "locale", "visited"]);
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
});
