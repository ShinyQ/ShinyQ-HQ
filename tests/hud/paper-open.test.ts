// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildRoomViews } from "@/content/room-views";
import { primeRoomViews } from "@/hud/drawer/data";
import { openPaperFor } from "@/hud/drawer/paper";
import { onHudCommand, type HudCommand } from "@/hud/events";

afterEach(() => {
  primeRoomViews("en", null);
  vi.unstubAllGlobals();
});

describe("openPaperFor", () => {
  it("opens the paper preview of a research item from the drawer data", async () => {
    const views = buildRoomViews("en");
    primeRoomViews("en", views);
    const item = views["L4:research"].research!.items[0];
    const seen: HudCommand[] = [];
    const off = onHudCommand((c) => seen.push(c));
    await expect(openPaperFor("en", item.id)).resolves.toBe(true);
    off();
    expect(seen).toEqual([{ type: "paper", paper: item.preview }]);
  });

  it("does nothing for an unknown id", async () => {
    primeRoomViews("en", buildRoomViews("en"));
    await expect(openPaperFor("en", "no-such-paper")).resolves.toBe(false);
  });

  it("does nothing when the drawer data fails to load", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("", { status: 500 }))));
    await expect(openPaperFor("en", "anything")).resolves.toBe(false);
  });
});
