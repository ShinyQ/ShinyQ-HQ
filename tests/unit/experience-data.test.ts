import { describe, expect, it } from "vitest";
import { buildExperienceData, countRooms } from "@/content/experience";
import { getCertifications, getStats } from "@/content/load";

const names = { L1: "Lobby", L2: "Career Archive", L3: "Labs", L4: "Library", RF: "Roof" };

describe("buildExperienceData", () => {
  it("resolves every text for the requested locale", () => {
    const en = buildExperienceData("en", names);
    const id = buildExperienceData("id", names);
    expect(en.locale).toBe("en");
    expect(en.profile.monogram).toBe("KAW");
    expect(en.profile.headline).not.toBe(id.profile.headline);
    expect(id.stats[0].label).toBe(getStats()[0].label.id);
  });

  it("carries the Lobby content", () => {
    const data = buildExperienceData("en", names);
    expect(data.stats.length).toBeGreaterThanOrEqual(4);
    expect(data.stats.length).toBeLessThanOrEqual(6);
    expect(data.skills.map((s) => s.id).sort()).toEqual(["ai", "cloud", "data", "software"]);
    expect(data.certifications).toHaveLength(getCertifications().length);
  });

  it("keeps verify links only where a credential URL exists", () => {
    const data = buildExperienceData("en", names);
    for (const cert of data.certifications) {
      const source = getCertifications().find((c) => c.id === cert.id)!;
      expect(cert.url).toBe(source.credentialUrl ?? null);
    }
    expect(data.certifications.filter((c) => c.url?.startsWith("https://learn.microsoft.com")).length).toBeGreaterThanOrEqual(3);
  });

  it("includes floors, years and the room count", () => {
    const data = buildExperienceData("en", names);
    expect(data.floors.L3).toEqual({ name: "Labs", route: "/labs" });
    expect(data.years[0]).toBe(2019);
    expect([...data.years].sort()).toEqual(data.years);
    expect(data.roomCount).toBe(countRooms());
    expect(data.roomCount).toBeGreaterThan(10);
  });

  it("is serializable", () => {
    const data = buildExperienceData("id", names);
    expect(JSON.parse(JSON.stringify(data))).toEqual(data);
  });
});
