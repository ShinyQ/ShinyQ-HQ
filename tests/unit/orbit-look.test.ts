import { describe, expect, it } from "vitest";
import { createOrbitState, primeZone, updateZone, yawLooking, type ViewZone } from "@/experience/camera/orbit";
import { FOLLOW, orbitOffset } from "@/experience/camera/rigs";

const unit = (x: number, z: number) => {
  const l = Math.hypot(x, z);
  return { x: x / l, z: z / l };
};

describe("yawLooking", () => {
  it("is 0 for the default north-west look and -PI/4 for north", () => {
    expect(yawLooking({ x: -1, z: -1 })).toBeCloseTo(0);
    expect(yawLooking({ x: 0, z: -1 })).toBeCloseTo(-Math.PI / 4);
  });

  it("puts the follow camera behind the rover, looking along the direction", () => {
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const d = { x: Math.cos(a), z: Math.sin(a) };
      for (const cls of ["desktop", "mobile"] as const) {
        const [ox, , oz] = orbitOffset(FOLLOW[cls].offset, yawLooking(d), 0);
        const o = unit(ox, oz);
        expect(o.x).toBeCloseTo(-d.x);
        expect(o.z).toBeCloseTo(-d.z);
      }
    }
  });
});

describe("primeZone", () => {
  const zone: ViewZone = { id: "L1:kiosk", area: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, yaw: 1.2, zoom: 1.3 };

  it("applies the zone at once, without easing", () => {
    const s = createOrbitState();
    primeZone(s, zone);
    expect(s).toMatchObject({ zone: "L1:kiosk", yaw: 1.2, yawTarget: 1.2, zoom: 1.3, zoomTarget: 1.3, zoneZoom: 1.3, easing: false });
  });

  it("leaves nothing for updateZone to do in the same zone", () => {
    const s = createOrbitState();
    primeZone(s, zone);
    const before = { ...s };
    updateZone(s, zone, false);
    expect(s).toEqual(before);
  });

  it("keeps the default view without a zone", () => {
    const s = createOrbitState();
    primeZone(s, null);
    expect(s).toMatchObject({ zone: null, yaw: 0, zoom: 1, easing: false });
  });
});
