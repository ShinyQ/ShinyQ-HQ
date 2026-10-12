import { describe, expect, it } from "vitest";
import { buildCareerData } from "@/content/experience";
import { floorOptions, floorThumb, nextIndex, yearOptions } from "@/hud/pads/picker";

describe("pad picker options", () => {
  it("lists the floors top-down like the elevator panel, with labels, descriptions and thumbnails", () => {
    const options = floorOptions("L3", (f) => `label ${f}`, (f) => `desc ${f}`);
    expect(options.map((o) => o.id)).toEqual(["RF", "L4", "L3", "L2", "L1"]);
    expect(options[2]).toEqual({ id: "L3", eyebrow: "L3", title: "label L3", detail: "desc L3", thumb: "/floors/L3.webp", current: true });
    expect(options.filter((o) => o.current)).toHaveLength(1);
    expect(floorThumb("RF")).toBe("/floors/RF.webp");
  });

  it("lists every year plaza oldest first with rooms and organizations, and the prologue on the first year", () => {
    const career = buildCareerData("en");
    const options = yearOptions(career, career.years[2].year, (n) => `${n} rooms`, "Prologue");
    expect(options.map((o) => Number(o.id))).toEqual(career.years.map((y) => y.year));
    expect(options.map((o) => o.title)).toEqual(career.years.map((y) => String(y.year)));
    expect(options.filter((o) => o.current).map((o) => o.id)).toEqual([String(career.years[2].year)]);
    const first = career.years[0];
    expect(options[0].detail.startsWith(`${first.entries.length} rooms`)).toBe(true);
    expect(options[0].detail).toContain(first.entries[0].org);
    const early = first.entries.find((e) => e.prologue);
    expect(options[0].eyebrow).toBe(early ? `Prologue \u00B7 ${early.period}` : undefined);
    expect(options.slice(1).every((o) => o.eyebrow === undefined)).toBe(true);
  });

  it("moves the roving focus with the arrows (wrapping), Home and End", () => {
    expect(nextIndex(0, "ArrowDown", 5)).toBe(1);
    expect(nextIndex(4, "ArrowDown", 5)).toBe(0);
    expect(nextIndex(0, "ArrowUp", 5)).toBe(4);
    expect(nextIndex(2, "ArrowRight", 5)).toBe(3);
    expect(nextIndex(2, "ArrowLeft", 5)).toBe(1);
    expect(nextIndex(3, "Home", 5)).toBe(0);
    expect(nextIndex(1, "End", 5)).toBe(4);
    expect(nextIndex(1, "Enter", 5)).toBeNull();
    expect(nextIndex(0, "ArrowDown", 0)).toBeNull();
  });
});
