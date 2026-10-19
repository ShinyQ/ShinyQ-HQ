import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildFloorRoomViews } from "@/content/room-views";
import { loadFloorViews, loadRoomView, peekFloorViews, primeFloorViews, setRoomDataVersions } from "@/hud/drawer/data";

const VERSIONS = { L1: "aaaaaaaaaaa1", L2: "aaaaaaaaaaa2", L3: "aaaaaaaaaaa3", L4: "aaaaaaaaaaa4", RF: "aaaaaaaaaaaf", B1: "aaaaaaaaaab1" };
const requested: string[] = [];

function reset() {
  for (const floor of ["L1", "L2", "L3", "L4", "RF", "B1"] as const) {
    primeFloorViews("en", floor, null);
    primeFloorViews("id", floor, null);
  }
}

beforeEach(() => {
  reset();
  requested.length = 0;
  setRoomDataVersions("en", VERSIONS);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      requested.push(url);
      const [, locale, floor] = /\/(?:b1-)?(en|id)(?:-(\w\w))?\.json/.exec(url)!;
      return Promise.resolve({ ok: true, json: () => Promise.resolve(buildFloorRoomViews(locale as "en", (floor ?? "B1") as "L1")) });
    }),
  );
});

afterEach(() => {
  reset();
  vi.unstubAllGlobals();
});

describe("room data loader", () => {
  it("requests only the floor file of the room asked for, with its version", async () => {
    const view = await loadRoomView("en", "L3:reactor");
    expect(view?.reactor).toBeDefined();
    expect(requested).toEqual(["/data/rooms/en-L3.json?v=aaaaaaaaaaa3"]);
  });

  it("fetches a floor once per locale and keeps it for a synchronous peek", async () => {
    expect(peekFloorViews("en", "L4")).toBeUndefined();
    await loadRoomView("en", "L4:research");
    await loadFloorViews("en", "L4");
    expect(requested).toEqual(["/data/rooms/en-L4.json?v=aaaaaaaaaaa4"]);
    expect(peekFloorViews("en", "L4")?.["L4:research"]).toBeDefined();
  });

  it("serves the secret B1 drawers from their own versioned file", async () => {
    await loadFloorViews("en", "B1");
    expect(requested).toEqual(["/data/rooms/b1-en.json?v=aaaaaaaaaab1"]);
  });

  it("resolves undefined for a room missing from its floor file", async () => {
    await expect(loadRoomView("en", "L1:no-such-room")).resolves.toBeUndefined();
  });

  it("forgets a failed load so the next call fetches again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: false, status: 503 })),
    );
    await expect(loadFloorViews("en", "L2")).rejects.toThrow("503");
    await expect(loadFloorViews("en", "L2")).rejects.toThrow("503");
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(2);
    expect(peekFloorViews("en", "L2")).toBeUndefined();
  });

  it("requests the plain path when no version was handed over", async () => {
    await loadFloorViews("id", "RF");
    expect(requested).toEqual(["/data/rooms/id-RF.json"]);
  });
});
