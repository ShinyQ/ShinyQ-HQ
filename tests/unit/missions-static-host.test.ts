import { describe, expect, it } from "vitest";
import { getContent } from "@/content/load";
import type { Locale } from "@/content/schema";
import { buildRoomCatalog } from "@/experience/missions/rooms";
import { createMissionRunner } from "@/experience/missions/runner";
import { createStaticHost } from "@/experience/missions/staticHost";
import { structuralLabels } from "@/hud/index-data";

const content = getContent();
const rooms = buildRoomCatalog(content, structuralLabels());

function setup(locale: Locale = "en") {
  const events: string[] = [];
  const host = createStaticHost({
    locale,
    rooms,
    navigate: (href) => events.push(`nav ${href}`),
    onSay: (text, ms) => events.push(`say ${text} ${ms}`),
    onPalette: (filter) => events.push(`palette ${filter ?? ""}`.trim()),
  });
  const runner = createMissionRunner({ host, missions: content.missions, rooms, random: () => 0 });
  return { host, runner, events };
}

describe("static mission host", () => {
  it("is flagged static", () => {
    expect(setup().host.isStatic).toBe(true);
  });

  it.each([
    ["best-ai", "en", ["nav /en/labs/voice-ai-contact-center"]],
    ["best-swe", "id", ["nav /id/labs/digital-banking-integrations"]],
    ["hire", "id", ["nav /id/contact"]],
    ["cv", "en", ["nav /en/cv"]],
    ["blog", "en", ["nav /en/blog/the-sun-the-moon-and-the-dark-sea"]],
    ["journey", "en", ["nav /en/journey#y2019", "say drive or swipe forward in time 2400"]],
    ["journey", "id", ["nav /id/journey#y2019", "say maju atau geser untuk menembus waktu 2400"]],
    ["projects", "en", ["nav /en/labs", "palette pods"]],
  ] as const)("maps %s (%s) to one navigation", async (mission, locale, expected) => {
    const { runner, events } = setup(locale);
    await expect(runner.start(mission)).resolves.toBe("done");
    expect(events).toEqual(expected);
  });

  it("navigates surprise to the picked room page", async () => {
    const { runner, events } = setup();
    await runner.start("surprise");
    const first = rooms.find((r) => r.surpriseWeight > 0)!;
    expect(events).toEqual([`nav /en${first.path}`]);
  });

  it("maps drawer tabs to page anchors", async () => {
    const { runner, events } = setup();
    await runner.goTo("L3:voice-ai-contact-center", "architecture");
    expect(events).toEqual(["nav /en/labs/voice-ai-contact-center#architecture"]);
  });

  it("opens external posts on the library shelf", async () => {
    const external = rooms.find((r) => r.kind === "post" && r.external)!;
    const { runner, events } = setup("id");
    await runner.goTo(external.id);
    expect(events).toEqual(["nav /id/library#posts"]);
  });

  it("navigates to the floor context when a mission ends after a drive", async () => {
    const { runner, events } = setup();
    await runner.runSteps("year:2024", [
      { kind: "elevator", floor: "L2" },
      { kind: "drive", to: "L2:jenius-2024" },
    ]);
    expect(events).toEqual(["nav /en/journey#y2024"]);
  });

  it("navigates to the floor page after an elevator-only mission", async () => {
    const { runner, events } = setup();
    await runner.runSteps("floor", [{ kind: "elevator", floor: "L4" }]);
    expect(events).toEqual(["nav /en/library"]);
  });

  it("does not navigate when a mission is cancelled", async () => {
    const { host, events } = setup();
    const signal = new AbortController().signal;
    await host.elevator("L3", { signal, missionId: "x" });
    host.finish?.("cancelled", "x");
    host.finish?.("done", "x");
    expect(events).toEqual([]);
  });

  it("rejects unknown rooms so the runner cancels", async () => {
    const { runner, events } = setup();
    await expect(runner.goTo("L3:does-not-exist")).resolves.toBe("cancelled");
    expect(events).toEqual([]);
  });
});
