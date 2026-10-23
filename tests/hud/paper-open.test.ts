// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildFloorRoomViews } from "@/content/room-views";
import { primeFloorViews } from "../helpers/room-data";
import { openPaperFor } from "@/hud/drawer/paper";
import { onHudCommand, type HudCommand } from "@/hud/events";

afterEach(() => {
  primeFloorViews("en", "L4", null);
  vi.unstubAllGlobals();
});

describe("openPaperFor", () => {
  it("opens the paper preview of a research item from the drawer data", async () => {
    const views = buildFloorRoomViews("en", "L4");
    primeFloorViews("en", "L4", views);
    const item = views["L4:research"].research!.items[0];
    const seen: HudCommand[] = [];
    const off = onHudCommand((c) => seen.push(c));
    await expect(openPaperFor("en", item.id)).resolves.toBe(true);
    off();
    expect(seen).toEqual([{ type: "paper", paper: item.preview }]);
  });

  it("does nothing for an unknown id", async () => {
    primeFloorViews("en", "L4", buildFloorRoomViews("en", "L4"));
    await expect(openPaperFor("en", "no-such-paper")).resolves.toBe(false);
  });

  it("does nothing when the drawer data fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 500 }))));
    await expect(openPaperFor("en", "anything")).resolves.toBe(false);
  });

  it("loads only the L4 file", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(Response.json(buildFloorRoomViews("en", "L4"))));
    vi.stubGlobal("fetch", fetchMock);
    const item = buildFloorRoomViews("en", "L4")["L4:research"].research!.items[0];
    await expect(openPaperFor("en", item.id)).resolves.toBe(true);
    expect(fetchMock.mock.calls.map((c) => String((c as unknown[])[0]).split("?")[0])).toEqual(["/data/rooms/en-L4.json"]);
  });
});
