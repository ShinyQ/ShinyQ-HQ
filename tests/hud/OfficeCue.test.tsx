// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEPLOY_CUE_MS, OfficeCue } from "@/hud/minimap/OfficeCue";
import { BEAM } from "@/experience/floors/lobby/office/beacon";
import { officeDockPad } from "@/experience/floors/lobby/officeLayout";
import { setOfficeSignal } from "@/experience/floors/lobby/office/officeSignal";
import { LOBBY } from "@/experience/config";

const svg = (el: React.ReactNode) => render(<svg>{el}</svg>);
afterEach(() => {
  vi.useRealTimers();
  setOfficeSignal({ asking: [], deployAt: null });
});

describe("OfficeCue", () => {
  it("renders nothing until a Rover asks", () => {
    const { container } = svg(<OfficeCue center={null} radius={22} />);
    expect(container.querySelector('[data-map="office-cue"]')).toBeNull();
  });
  it("rings the stop when it is in the window, else pins the rim toward it", () => {
    act(() => setOfficeSignal({ asking: [1], goodAt: Date.now() }));
    const near = svg(<OfficeCue center={LOBBY.officeWing.stop} radius={22} />);
    expect(near.container.querySelector('[data-cue="ring"]')).not.toBeNull();
    const far = svg(<OfficeCue center={{ x: LOBBY.officeWing.stop.x, z: LOBBY.officeWing.stop.z - 60 }} radius={22} />);
    const pip = far.container.querySelector('[data-cue="pip"]')!;
    expect(Number(pip.getAttribute("cy"))).toBeGreaterThan(LOBBY.officeWing.stop.z - 60);
    // 2.5 in from the rim, so its pulse (1.35 times r 1.6) never meets the clip.
    expect(Number(pip.getAttribute("cy")) - (LOBBY.officeWing.stop.z - 60)).toBeCloseTo(22 - 2.5, 6);
    expect(22 - (Number(pip.getAttribute("cy")) - (LOBBY.officeWing.stop.z - 60)) - 1.35 * Number(pip.getAttribute("r"))).toBeGreaterThan(0);
  });

  it("rings the dock green for the beam's 8 s on a fresh production deploy, once per deploy, the asks cue alongside", () => {
    vi.useFakeTimers();
    expect(DEPLOY_CUE_MS).toBe(BEAM.s * 1000);
    const dock = officeDockPad(LOBBY.officeWing);
    const view = svg(<OfficeCue center={LOBBY.officeWing.stop} radius={22} />);
    const deploy = () => view.container.querySelector('[data-map="office-deploy-cue"]');
    expect(deploy()).toBeNull();
    act(() => setOfficeSignal({ deployAt: 1_000, goodAt: Date.now() }));
    const ring = deploy()!.querySelector('[data-cue="ring"]')!;
    expect([Number(ring.getAttribute("cx")), Number(ring.getAttribute("cy"))]).toEqual([dock.x, dock.z]);
    expect(ring.getAttribute("stroke")).toBe("var(--color-green)");
    // The pulse class: `.office-cue` pulses, and holds still (a steady ring) under reduced motion.
    expect(ring.getAttribute("class")).toBe("office-cue");
    act(() => setOfficeSignal({ asking: [2] }));
    expect(view.container.querySelector('[data-map="office-cue"]')).not.toBeNull();
    expect(deploy()).not.toBeNull();
    act(() => vi.advanceTimersByTime(DEPLOY_CUE_MS - 1));
    expect(deploy()).not.toBeNull();
    // A cleared signal keeps the rest of the 8 s, like the beam.
    act(() => setOfficeSignal({ deployAt: null }));
    expect(deploy()).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(deploy()).toBeNull();
    expect(view.container.querySelector('[data-map="office-cue"]')).not.toBeNull();
    // The same deploy again never replays; a newer one does.
    act(() => setOfficeSignal({ deployAt: 1_000 }));
    expect(deploy()).toBeNull();
    act(() => setOfficeSignal({ deployAt: 2_000 }));
    expect(deploy()).not.toBeNull();
    act(() => vi.advanceTimersByTime(DEPLOY_CUE_MS));
    expect(deploy()).toBeNull();
  });
  it("pins the deploy cue to the rim toward the dock when the dock lies outside the window", () => {
    act(() => setOfficeSignal({ deployAt: 3_000, goodAt: Date.now() }));
    const center = { x: LOBBY.officeWing.stop.x, z: LOBBY.officeWing.stop.z - 60 };
    const far = svg(<OfficeCue center={center} radius={22} />);
    const pip = far.container.querySelector('[data-map="office-deploy-cue"] [data-cue="pip"]')!;
    expect(pip.getAttribute("fill")).toBe("var(--color-green)");
    expect(Math.hypot(Number(pip.getAttribute("cx")) - center.x, Number(pip.getAttribute("cy")) - center.z)).toBeCloseTo(22 - 2.5, 6);
  });
});
