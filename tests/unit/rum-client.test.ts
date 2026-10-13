import { describe, expect, it } from "vitest";
import { RUM_MIN_FRAMES, RUM_WARMUP_MS, RUM_WINDOW_FRAMES, RumSession } from "@/experience/perf/rum";
import { rumDecision, rumPath, type RumDecisionInput } from "@/experience/perf/rumDecision";

const base: RumDecisionInput = { stored: null, search: "", webdriver: false, privacySignal: false, random: 0.1 };

describe("RUM sampling", () => {
  it("samples a quarter of new sessions", () => {
    expect(rumDecision({ ...base, random: 0.24 })).toBe("on");
    expect(rumDecision({ ...base, random: 0.25 })).toBe("off");
  });

  it("keeps the session's decision and sends at most once per session", () => {
    expect(rumDecision({ ...base, stored: "off", random: 0 })).toBe("off");
    expect(rumDecision({ ...base, stored: "on", random: 0.9 })).toBe("on");
    expect(rumDecision({ ...base, stored: "sent", search: "?rum=1" })).toBe("sent");
  });

  it("never samples automation or visitors with Do Not Track or Global Privacy Control, unless forced", () => {
    expect(rumDecision({ ...base, webdriver: true })).toBe("off");
    expect(rumDecision({ ...base, privacySignal: true })).toBe("off");
    expect(rumDecision({ ...base, webdriver: true, search: "?tier=lite&rum=1" })).toBe("on");
    expect(rumDecision({ ...base, search: "?rum=0" })).toBe("off");
    expect(rumDecision({ ...base, search: "?rum=10" })).toBe("on");
  });

  it("names the load path coarsely", () => {
    expect(rumPath({ coverUsed: true })).toBe("cover");
    expect(rumPath({ coverUsed: false })).toBe("enter");
    expect(rumPath({ startFloor: "L3", coverUsed: true })).toBe("deeplink");
    expect(rumPath({ startRoom: "L2:jenius-2024", coverUsed: false })).toBe("deeplink");
  });
});

describe("RUM session", () => {
  const explore = 4200;

  it("counts frames only after the warm-up, while visible, up to the window", () => {
    const s = new RumSession({ tier: "full", path: "cover" });
    s.frame(16, explore + RUM_WARMUP_MS - 1, explore, true);
    s.frame(16, explore + RUM_WARMUP_MS + 10, null, true);
    s.frame(16, explore + RUM_WARMUP_MS + 10, explore, false);
    expect(s.sampled).toBe(0);
    for (let i = 0; i < RUM_WINDOW_FRAMES + 50; i++) s.frame(16, explore + RUM_WARMUP_MS + i * 16, explore, true);
    expect(s.sampled).toBe(RUM_WINDOW_FRAMES);
  });

  it("reports FPS buckets, the explore bucket, context loss and the boot timeout", () => {
    const s = new RumSession({ tier: "lite", path: "deeplink" });
    for (let i = 0; i < 90; i++) s.frame(16, explore + RUM_WARMUP_MS + i, explore, true);
    for (let i = 0; i < 10; i++) s.frame(50, explore + RUM_WARMUP_MS + 100 + i, explore, true);
    s.contextLost();
    expect(s.payload({ released: "timeout", exploreAt: explore })).toEqual({ v: 1, tier: "lite", path: "deeplink", fps50: "55+", fps10: "15-24", explore: "3-5s", lost: 1, timeout: 1 });
  });

  it("says na when too few frames were seen or explore never came", () => {
    const s = new RumSession({ tier: "full", path: "enter" });
    for (let i = 0; i < RUM_MIN_FRAMES - 1; i++) s.frame(16, explore + RUM_WARMUP_MS + i, explore, true);
    expect(s.payload({ released: "ready", exploreAt: null })).toEqual({ v: 1, tier: "full", path: "enter", fps50: "na", fps10: "na", explore: "na", lost: 0, timeout: 0 });
  });
});
