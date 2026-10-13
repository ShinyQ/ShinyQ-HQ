// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { decideRum, RUM_SESSION_KEY } from "@/experience/perf/rumDecision";
import { STATS_OPTOUT_KEY } from "@/lib/stats/optout";

describe("performance beacon and the visit stats opt-out", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, "", "/en?rum=1");
  });

  it("runs when forced and the visitor did not opt out", () => {
    expect(decideRum()).toBe(true);
  });

  it("never runs after \"Don't count my visits\", even when forced", () => {
    localStorage.setItem(STATS_OPTOUT_KEY, "1");
    expect(decideRum()).toBe(false);
    expect(sessionStorage.getItem(RUM_SESSION_KEY)).toBe("off");
  });
});
