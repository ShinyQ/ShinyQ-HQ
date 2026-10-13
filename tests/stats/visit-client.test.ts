// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STATS_OPTOUT_EVENT, STATS_OPTOUT_KEY } from "@/lib/stats/optout";
import { CLASSIC_DWELL_MS, resetVisitBeacon, startVisitBeacon, visitAllowed, visitMode, viewOf } from "@/lib/stats/visitClient";

const base = { privacySignal: false, webdriver: false, crawler: false, search: "", optedOut: false };

describe("visitAllowed", () => {
  it("counts a normal visit", () => {
    expect(visitAllowed(base)).toBe(true);
  });

  it("never counts with Do Not Track, Global Privacy Control or the opt-out, even when forced", () => {
    expect(visitAllowed({ ...base, privacySignal: true, search: "?visit=1" })).toBe(false);
    expect(visitAllowed({ ...base, optedOut: true, search: "?visit=1" })).toBe(false);
  });

  it("skips automation and crawlers unless ?visit=1 forces it, and ?visit=0 opts out", () => {
    expect(visitAllowed({ ...base, webdriver: true })).toBe(false);
    expect(visitAllowed({ ...base, crawler: true })).toBe(false);
    expect(visitAllowed({ ...base, webdriver: true, search: "?tier=lite&visit=1" })).toBe(true);
    expect(visitAllowed({ ...base, search: "?visit=0" })).toBe(false);
  });
});

describe("visitMode and viewOf", () => {
  it("names what the page lifetime used", () => {
    expect(visitMode({ threeD: false, classic: false })).toBeNull();
    expect(visitMode({ threeD: true, classic: false })).toBe("3d");
    expect(visitMode({ threeD: false, classic: true })).toBe("classic");
    expect(visitMode({ threeD: true, classic: true })).toBe("both");
  });

  it("reads the view from the html attributes", () => {
    const html = (attrs: string[]) => ({ hasAttribute: (n: string) => attrs.includes(n) });
    expect(viewOf(html(["data-hq"]), true)).toBe("3d");
    expect(viewOf(html(["data-hq-boot"]), true)).toBeNull();
    expect(viewOf(html([]), true)).toBe("classic");
    expect(viewOf(html([]), false)).toBeNull();
  });
});

describe("startVisitBeacon", () => {
  const beacons: { url: string; body: string }[] = [];
  let visibility: DocumentVisibilityState = "visible";
  let t = 0;
  const clock = () => t;
  const start = () => startVisitBeacon(clock);

  beforeEach(() => {
    beacons.length = 0;
    visibility = "visible";
    t = 0;
    resetVisitBeacon();
    localStorage.clear();
    document.documentElement.removeAttribute("data-hq");
    document.documentElement.removeAttribute("data-hq-boot");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => false });
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, get: () => null });
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: (url: string, body: string) => {
        beacons.push({ url, body });
        return true;
      },
    });
  });

  afterEach(() => vi.restoreAllMocks());

  const hide = () => {
    visibility = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("sends one classic point when the page is hidden, and only once", async () => {
    start();
    t += CLASSIC_DWELL_MS;
    hide();
    hide();
    window.dispatchEvent(new Event("pagehide"));
    expect(beacons).toEqual([{ url: "/api/visit", body: '{"v":1,"mode":"classic"}' }]);
  });

  it("reports both views when the 3D tower opened after the Classic site", async () => {
    start();
    t += CLASSIC_DWELL_MS;
    document.documentElement.setAttribute("data-hq", "3d");
    await flush();
    hide();
    expect(JSON.parse(beacons[0].body)).toEqual({ v: 1, mode: "both" });
  });

  it("reports 3D when the boot cover handed over to the tower", async () => {
    document.documentElement.setAttribute("data-hq-boot", "");
    start();
    document.documentElement.setAttribute("data-hq", "3d");
    document.documentElement.removeAttribute("data-hq-boot");
    await flush();
    hide();
    expect(JSON.parse(beacons[0].body)).toEqual({ v: 1, mode: "3d" });
  });

  it("does not count a short Classic moment before the tower (released boot cover)", async () => {
    start();
    t += CLASSIC_DWELL_MS - 1;
    document.documentElement.setAttribute("data-hq", "3d");
    await flush();
    t += 60_000;
    hide();
    expect(JSON.parse(beacons[0].body)).toEqual({ v: 1, mode: "3d" });
  });

  it("does not count time while the tab was hidden", async () => {
    start();
    t += 1000;
    hide();
    expect(beacons).toEqual([]);
    t += 60_000;
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    t += 1000;
    hide();
    expect(beacons).toEqual([]);
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    t += CLASSIC_DWELL_MS;
    window.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(beacons[0].body)).toEqual({ v: 1, mode: "classic" });
  });

  it("sends nothing for a page that was never seen", () => {
    visibility = "hidden";
    start();
    window.dispatchEvent(new Event("pagehide"));
    expect(beacons).toEqual([]);
  });

  it("sends nothing after an opt-out, even one made after load", async () => {
    start();
    t += CLASSIC_DWELL_MS;
    localStorage.setItem(STATS_OPTOUT_KEY, "1");
    window.dispatchEvent(new Event(STATS_OPTOUT_EVENT));
    localStorage.removeItem(STATS_OPTOUT_KEY);
    hide();
    expect(beacons).toEqual([]);
  });

  it("sends nothing when opted out before load or under Do Not Track", () => {
    localStorage.setItem(STATS_OPTOUT_KEY, "1");
    start();
    hide();
    expect(beacons).toEqual([]);
    resetVisitBeacon();
    localStorage.clear();
    visibility = "visible";
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, get: () => "1" });
    start();
    hide();
    expect(beacons).toEqual([]);
  });

  it("re-checks the opt-out when it sends", () => {
    start();
    t += CLASSIC_DWELL_MS;
    localStorage.setItem(STATS_OPTOUT_KEY, "1");
    hide();
    expect(beacons).toEqual([]);
  });

  it("starts once per page lifetime and stores nothing", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    start();
    start();
    t += CLASSIC_DWELL_MS;
    hide();
    expect(beacons).toHaveLength(1);
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
  });

  it("can start again after a cleanup that sent nothing (Strict Mode remount)", () => {
    const stop = start();
    stop();
    start();
    t += CLASSIC_DWELL_MS;
    hide();
    expect(beacons).toHaveLength(1);
  });
});
