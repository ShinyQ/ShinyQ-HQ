// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OfficeCue } from "@/hud/minimap/OfficeCue";
import { setOfficeSignal } from "@/experience/floors/lobby/office/officeSignal";
import { LOBBY } from "@/experience/config";

const svg = (el: React.ReactNode) => render(<svg>{el}</svg>);
afterEach(() => setOfficeSignal({ asking: [] }));

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
  });
});
