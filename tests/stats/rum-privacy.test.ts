// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { decideRum, RUM_SESSION_KEY } from "@/experience/perf/rumDecision";

describe("performance beacon and browser privacy signals", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/en?rum=1");
  });

  afterEach(() => {
    Reflect.deleteProperty(navigator, "doNotTrack");
  });

  it("runs when forced, even with a stale key from the retired \"Don't count my visits\" switch", () => {
    localStorage.setItem("hq:stats-optout", "1");
    expect(decideRum()).toBe(true);
  });

  it("never runs under Do Not Track, even when forced", () => {
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, get: () => "1" });
    expect(decideRum()).toBe(false);
    expect(sessionStorage.getItem(RUM_SESSION_KEY)).toBe("off");
  });
});
