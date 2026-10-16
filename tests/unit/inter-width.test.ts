import { describe, expect, it } from "vitest";
import troikaFonts from "@/experience/troika-fonts.json";
import { INTER_400_FILE, interWidth } from "@/experience/fx/interWidth";

describe("interWidth (Inter 400 advances)", () => {
  it("is pinned to the shipped Inter 400 cut", () => {
    // Regenerate the table (see the module comment) whenever this file name changes.
    expect(troikaFonts.sans.endsWith(INTER_400_FILE)).toBe(true);
  });
  it("measures known titles within 1 percent of fonttools", () => {
    expect(interWidth("Vendor Management Portal")).toBeCloseTo(12.95, 1);
    expect(
      interWidth("Serupa Ticket Hub: Event Ticketing Platform"),
    ).toBeCloseTo(20.95, 1);
    expect(interWidth("")).toBe(0);
  });
  it("counts characters outside the table as 0.6 em", () => {
    expect(interWidth("\u25C6")).toBeCloseTo(0.6);
  });
});
