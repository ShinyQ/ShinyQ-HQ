import { describe, expect, it } from "vitest";
import { hudLayout } from "@/hud/layout";

describe("hudLayout", () => {
  it("maps viewport and pointer to the Corners or desktop HUD", () => {
    expect(hudLayout("mobile", true)).toBe("phone");
    expect(hudLayout("mobile", false)).toBe("phone");
    expect(hudLayout("tablet", true)).toBe("tablet");
    expect(hudLayout("tablet", false)).toBe("tablet");
    expect(hudLayout("desktop", true)).toBe("tablet");
    expect(hudLayout("desktop", false)).toBe("desktop");
  });
});
