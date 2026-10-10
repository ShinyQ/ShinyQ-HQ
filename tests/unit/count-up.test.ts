import { describe, expect, it } from "vitest";
import { countUp } from "@/experience/fx/countUp";

describe("countUp", () => {
  it("animates numeric parts from zero and keeps the suffix", () => {
    expect(countUp("800+", 0.5)).toBe("400+");
    expect(countUp("800+", 0)).toBe("0+");
    expect(countUp("10x", 0.5)).toBe("5x");
  });
  it("keeps thousands separators and ends on the exact value", () => {
    expect(countUp("7,350", 1)).toBe("7,350");
    expect(countUp("7,350", 0.5)).toBe("3,675");
  });
  it("leaves years alone", () => {
    expect(countUp("2019", 0.3)).toBe("2019");
  });
});
