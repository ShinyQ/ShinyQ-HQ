// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import type { Interactable } from "@/experience/interact/registry";
import { onWorldMissed, POINT_HINT_KEY } from "@/experience/interact/missed";
import { roverRuntime } from "@/experience/rover/runtime";
import { getHQStore } from "@/store/useHQStore";

const pod: Interactable = {
  id: "L3:door:demo",
  floor: "L3",
  kind: "door",
  label: "Demo",
  at: { x: 0, z: 0 },
  bounds: { minX: -1, maxX: 1, minZ: 1, maxZ: 3 },
  action: { type: "open-room", room: "L3:demo" },
};
const click = () => new MouseEvent("click");

beforeEach(() => {
  sessionStorage.clear();
  roverRuntime.autopilot = null;
  getHQStore().setState({ phase: "explore", activeRoom: null, ride: null, beam: null, picker: null, hover: null, pointHint: false });
});

describe("onWorldMissed (a click on no target)", () => {
  it("never drives, and shows the point-and-go hint once per session", () => {
    onWorldMissed(click());
    expect(getHQStore().getState().pointHint).toBe(true);
    expect(sessionStorage.getItem(POINT_HINT_KEY)).toBe("1");
    expect(roverRuntime.autopilot).toBeNull();
    getHQStore().getState().setPointHint(false);
    onWorldMissed(click());
    expect(getHQStore().getState().pointHint).toBe(false);
  });

  it("closes an open room instead of showing the hint", () => {
    getHQStore().setState({ phase: "room", activeRoom: "L3:demo" });
    onWorldMissed(click());
    expect(getHQStore().getState().phase).toBe("explore");
    expect(getHQStore().getState().activeRoom).toBeNull();
    expect(getHQStore().getState().pointHint).toBe(false);
  });

  it("clears a tap selection", () => {
    getHQStore().getState().setHover({ item: pod, via: "tap" });
    onWorldMissed(click());
    expect(getHQStore().getState().hover).toBeNull();
  });

  it("ignores right clicks, double clicks and overlays", () => {
    onWorldMissed(new MouseEvent("contextmenu"));
    onWorldMissed(new MouseEvent("dblclick"));
    getHQStore().setState({ picker: { kind: "floor" } });
    onWorldMissed(click());
    expect(getHQStore().getState().pointHint).toBe(false);
    expect(sessionStorage.getItem(POINT_HINT_KEY)).toBeNull();
  });
});
