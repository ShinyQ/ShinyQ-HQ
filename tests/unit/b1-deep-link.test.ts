import { afterEach, describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import { startFloor } from "@/experience/b1";
import { engineRoomAction } from "@/hud/dialog/engineRoomAction";
import { hudActions, registerHudAction } from "@/hud/hudActions";
import { buildHudIndex } from "@/hud/index-data";
import { buildPaletteEntries, searchPalette } from "@/hud/search";
import { createHQStore } from "@/store/useHQStore";

const index = buildHudIndex(getContent());
const STATIC = ["view-cv", "copy-email", "toggle-language", "quick-view"] as const;

describe("B1 deep links", () => {
  it("starts on B1 only when unlocked; every other start floor passes through", () => {
    expect(startFloor("B1", true)).toBe("B1");
    expect(startFloor("B1", false)).toBeUndefined();
    expect(startFloor("L3", false)).toBe("L3");
    expect(startFloor(undefined, true)).toBeUndefined();
  });

  it("never opens a B1 station drawer while B1 is locked (a stale history entry)", () => {
    const store = createHQStore();
    store.getState().openRoom("B1:timeline");
    expect(store.getState().activeRoom).toBeNull();
    expect(store.getState().visited).toEqual([]);
    store.getState().unlockB1();
    store.getState().openRoom("B1:timeline");
    expect(store.getState().activeRoom).toBe("B1:timeline");
  });
});

describe("Cmd-K Engine Room action", () => {
  afterEach(() => {
    for (const action of hudActions()) registerHudAction(action)();
  });

  it("is absent until the 3D HUD registers it, so the palette is unchanged", () => {
    const plain = buildPaletteEntries(index, STATIC);
    expect(buildPaletteEntries(index, STATIC, [])).toEqual(plain);
    for (const q of ["engine room", "b1", "ruang mesin"]) {
      expect(searchPalette(plain, q).flatMap((g) => g.entries).some((e) => e.key === "action:engine-room"), q).toBe(false);
    }
  });

  it("is found in English and Indonesian once registered", () => {
    for (const label of ["Go to B1 Engine Room", "Ke Ruang Mesin B1"]) {
      const entries = buildPaletteEntries(index, STATIC, [engineRoomAction(label)]);
      for (const q of ["engine room", "b1", "how this site was built", "ruang mesin", "lantai rahasia"]) {
        const rows = searchPalette(entries, q).flatMap((g) => g.entries);
        expect(rows.some((e) => e.key === "action:engine-room"), `${label}: ${q}`).toBe(true);
      }
      const entry = entries.find((e) => e.key === "action:engine-room");
      expect(entry).toMatchObject({ group: "actions", title: { en: label, id: label }, target: { type: "hud", id: "engine-room" } });
    }
  });

  it("registers one action per id and clears it on unregister", () => {
    const off = registerHudAction(engineRoomAction("Go to B1 Engine Room"));
    const offAgain = registerHudAction(engineRoomAction("Ke Ruang Mesin B1"));
    expect(hudActions().map((a) => [a.id, a.label])).toEqual([["engine-room", "Ke Ruang Mesin B1"]]);
    off();
    expect(hudActions()).toHaveLength(1);
    offAgain();
    expect(hudActions()).toEqual([]);
  });
});
