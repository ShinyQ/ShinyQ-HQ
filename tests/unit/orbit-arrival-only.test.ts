import { describe, expect, it } from "vitest";
import { activeZone, createOrbitState, primeZone, updateZone, type ViewZone } from "@/experience/camera/orbit";

const arrival: ViewZone = { id: "L4:arrival", area: { minX: -6, maxX: -2, minZ: -2, maxZ: 2 }, yaw: -2.4, zoom: 1.1, railYaw: -1.5, arrivalOnly: true };
const plain: ViewZone = { id: "L4:plain", area: { minX: 10, maxX: 20, minZ: -2, maxZ: 2 }, yaw: 0.5 };

describe("arrival-only view zones (Round 8 J)", () => {
  it("ignores an arrival zone the rover drives into", () => {
    const s = createOrbitState();
    expect(activeZone(arrival, s)).toBeNull();
    updateZone(s, activeZone(arrival, s), false, "desktop", true);
    expect(s.zone).toBeNull();
    expect(s.yawTarget).toBe(0);
    expect(s.railYawTarget).toBe(0);
    expect(s.easing).toBe(false);
  });

  it("keeps an arrival zone that an arrival or a deep link primed, and lets the rover leave it", () => {
    const s = createOrbitState();
    primeZone(s, arrival, "desktop", true);
    expect(activeZone(arrival, s)).toBe(arrival);
    updateZone(s, activeZone(arrival, s), false, "desktop", true);
    expect(s.zone).toBe("L4:arrival");
    expect(s.easing).toBe(false);
    updateZone(s, activeZone(null, s), false, "desktop", true);
    expect(s.zone).toBeNull();
    // Driving back in later does nothing.
    expect(activeZone(arrival, s)).toBeNull();
  });

  it("passes ordinary zones and no zone through unchanged", () => {
    const s = createOrbitState();
    expect(activeZone(plain, s)).toBe(plain);
    expect(activeZone(null, s)).toBeNull();
    primeZone(s, arrival);
    expect(activeZone(plain, s)).toBe(plain);
  });
});
