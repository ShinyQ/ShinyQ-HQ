import { expect, it } from "vitest";
import { COLORS } from "@/experience/config";
import { roomLabelSet, ROOM_LABEL_Y, signpostSet } from "@/experience/floors/career/labels";
import { CAREER_ROAD, type CareerRoadLayout, type CareerRoom } from "@/experience/floors/career/layout";
import type { CareerEntryView } from "@/experience/types";

const room = (slug: string, x: number): CareerRoom => ({ id: `L2:${slug}`, slug, type: "job", year: 2024, index: 0, side: 1, center: { x, z: 6 }, w: 7, d: 6 }) as unknown as CareerRoom;
const entry = (slug: string): CareerEntryView => ({ slug, type: "job", role: "Engineer", org: "Acme", period: "2024", prologue: false });

it("builds one outlined, tilted label per room that has an entry, in room order", () => {
  const set = roomLabelSet([room("a", 10), room("b", 30), room("c", 50)], new Map([["a", entry("a")], ["c", entry("c")]]));
  expect(set.xs).toEqual([10, 50]);
  // Room labels turn around their own spot, like the Readable wrapper they replace.
  expect(set.pivots).toEqual([[10, 6], [50, 6]]);
  expect(set.flippedText).toBeUndefined();
  expect(set.labels).toHaveLength(2);
  expect(set.labels[0]).toMatchObject({
    text: "Engineer\nAcme \u00B7 2024",
    position: [10, ROOM_LABEL_Y, 6],
    tilt: 0.55,
    fontSize: 0.4,
    lineHeight: 1.25,
    maxWidth: 7.6,
    outlineWidth: 0.03,
    outlineColor: COLORS.void,
    textAlign: "center",
    color: "#f4f4f5",
    anchorX: "center",
    anchorY: "bottom",
  });
});

it("builds one signpost per year gate, in front of the arch", () => {
  const years = [{ year: 2021, rooms: [1, 2, 3], arch: { center: { x: 5, z: 0 } } }] as unknown as CareerRoadLayout["years"];
  const set = signpostSet(years, (n) => `${n} rooms`);
  expect(set.xs).toEqual([5]);
  expect(set.pivots).toEqual([[5, 0]]);
  expect(set.flippedText).toEqual(["\u2190 2021 \u00B7 3 rooms"]);
  expect(set.labels[0]).toMatchObject({
    text: "2021 \u00B7 3 rooms \u2192",
    position: [5, CAREER_ROAD.archHeight - 0.2, CAREER_ROAD.width / 2 + 1.4],
    fontSize: 0.42,
    letterSpacing: 0.06,
    color: COLORS.white,
    outlineWidth: 0.03,
    anchorX: "center",
    anchorY: "top",
  });
});
