import { describe, expect, it } from "vitest";
import { zoneAt, type ViewZone } from "@/experience/camera/orbit";

const zone: ViewZone = { id: "L3:test", area: { minX: 0, maxX: 10, minZ: -2, maxZ: 2 }, yaw: 0, travel: { x: 1, z: 0 } };
const plain: ViewZone = { id: "L3:plain", area: { minX: 20, maxX: 30, minZ: -2, maxZ: 2 }, yaw: 0 };

describe("directional view zones (Round 7 G)", () => {
  it("applies a travel zone to a rover facing within 90 degrees of its direction, or without a heading", () => {
    expect(zoneAt("L3", { x: 5, z: 0 }, [zone])?.id).toBe("L3:test");
    expect(zoneAt("L3", { x: 5, z: 0, heading: Math.PI / 2 }, [zone])?.id).toBe("L3:test");
    expect(zoneAt("L3", { x: 5, z: 0, heading: Math.PI / 4 }, [zone])?.id).toBe("L3:test");
    expect(zoneAt("L3", { x: 5, z: 0, heading: 0 }, [zone])?.id).toBe("L3:test");
  });

  it("keeps a little slack past perpendicular, so a rover arriving due north or south still gets the zone", () => {
    expect(zoneAt("L3", { x: 5, z: 0, heading: Math.PI }, [zone])?.id).toBe("L3:test");
    expect(zoneAt("L3", { x: 5, z: 0, heading: Math.PI + (10 * Math.PI) / 180 }, [zone])?.id).toBe("L3:test");
  });

  it("falls through a skipped travel zone to the next matching zone", () => {
    const under: ViewZone = { id: "L3:under", area: zone.area, yaw: 1 };
    expect(zoneAt("L3", { x: 5, z: 0, heading: -Math.PI / 2 }, [zone, under])?.id).toBe("L3:under");
    expect(zoneAt("L3", { x: 5, z: 0, heading: Math.PI / 2 }, [zone, under])?.id).toBe("L3:test");
  });

  it("skips a travel zone for a rover driving against it", () => {
    expect(zoneAt("L3", { x: 5, z: 0, heading: -Math.PI / 2 }, [zone])).toBeNull();
    expect(zoneAt("L3", { x: 5, z: 0, heading: (-3 * Math.PI) / 4 }, [zone])).toBeNull();
  });

  it("leaves zones without a travel direction as they were", () => {
    expect(zoneAt("L3", { x: 25, z: 0, heading: -Math.PI / 2 }, [plain])?.id).toBe("L3:plain");
  });
});

describe("class-limited view zones (`ViewZone.only`, spec 2026-10-29)", () => {
  const only: ViewZone = { id: "L2:only", area: { minX: 0, maxX: 10, minZ: -2, maxZ: 2 }, yaw: 0, only: ["landscape"] };
  const open: ViewZone = { id: "L2:open", area: only.area, yaw: 0 };

  it("applies only to the listed classes; others (and callers without a class) fall through as open floor", () => {
    expect(zoneAt("L2", { x: 5, z: 0 }, [only], "landscape")?.id).toBe("L2:only");
    for (const cls of ["desktop", "tablet", "mobile"] as const) expect(zoneAt("L2", { x: 5, z: 0 }, [only], cls)).toBeNull();
    expect(zoneAt("L2", { x: 5, z: 0 }, [only])).toBeNull();
    expect(zoneAt("L2", { x: 5, z: 0 }, [only, open], "mobile")?.id).toBe("L2:open");
  });
});
