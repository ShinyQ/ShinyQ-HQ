// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CLASSIC_DWELL_MS, clearLegacyOptOut, countIntent, intentOf, LEGACY_OPTOUT_KEY, resetVisitBeacon, startVisitBeacon, visitAllowed, visitMode, viewOf, VISIT_SESSION_KEY } from "@/lib/stats/visitClient";

const base = { webdriver: false, crawler: false, search: "" };
const VISIT = { url: "/api/visit", body: '{"v":1,"kind":"visit"}' };

describe("visitAllowed", () => {
  it("counts a normal visit", () => {
    expect(visitAllowed(base)).toBe(true);
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
  const sent: { url: string; body: string }[] = [];
  /** Mode pings only (the visit ping is checked on its own). */
  const modes = () => sent.filter((b) => b.body.includes('"mode"'));
  const intents = () => sent.filter((b) => b.body.includes('"intent"')).map((b) => JSON.parse(b.body).intent as string);
  const visits = () => sent.filter((b) => b.body.includes('"kind"'));
  let visibility: DocumentVisibilityState = "visible";
  let t = 0;
  const clock = () => t;
  const cleanups: (() => void)[] = [];
  const start = () => {
    const stop = startVisitBeacon(clock);
    cleanups.push(stop);
    return stop;
  };

  beforeEach(() => {
    sent.length = 0;
    visibility = "visible";
    t = 0;
    resetVisitBeacon();
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.removeAttribute("data-hq");
    document.documentElement.removeAttribute("data-hq-boot");
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => false });
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, get: () => null });
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: (url: string, body: string) => {
        sent.push({ url, body });
        return true;
      },
    });
  });

  afterEach(() => {
    cleanups.splice(0).forEach((stop) => stop());
    vi.restoreAllMocks();
  });

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
    expect(modes()).toEqual([{ url: "/api/visit", body: '{"v":1,"mode":"classic"}' }]);
  });

  it("reports both views when the 3D tower opened after the Classic site", async () => {
    start();
    t += CLASSIC_DWELL_MS;
    document.documentElement.setAttribute("data-hq", "3d");
    await flush();
    hide();
    expect(JSON.parse(modes()[0].body)).toEqual({ v: 1, mode: "both" });
  });

  it("reports 3D when the boot cover handed over to the tower", async () => {
    document.documentElement.setAttribute("data-hq-boot", "");
    start();
    document.documentElement.setAttribute("data-hq", "3d");
    document.documentElement.removeAttribute("data-hq-boot");
    await flush();
    hide();
    expect(JSON.parse(modes()[0].body)).toEqual({ v: 1, mode: "3d" });
  });

  it("does not count a short Classic moment before the tower (released boot cover)", async () => {
    start();
    t += CLASSIC_DWELL_MS - 1;
    document.documentElement.setAttribute("data-hq", "3d");
    await flush();
    t += 60_000;
    hide();
    expect(JSON.parse(modes()[0].body)).toEqual({ v: 1, mode: "3d" });
  });

  it("does not count time while the tab was hidden", async () => {
    start();
    t += 1000;
    hide();
    expect(modes()).toEqual([]);
    t += 60_000;
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    t += 1000;
    hide();
    expect(modes()).toEqual([]);
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    t += CLASSIC_DWELL_MS;
    window.dispatchEvent(new Event("pagehide"));
    expect(JSON.parse(modes()[0].body)).toEqual({ v: 1, mode: "classic" });
  });

  it("sends nothing for a page that was never seen", () => {
    visibility = "hidden";
    start();
    window.dispatchEvent(new Event("pagehide"));
    expect(modes()).toEqual([]);
  });

  it("clears a stale opt-out key from the retired switch and counts the visit (owner decision 2026-10-23)", () => {
    expect(LEGACY_OPTOUT_KEY).toBe("hq:stats-optout");
    localStorage.setItem(LEGACY_OPTOUT_KEY, "1");
    start();
    expect(localStorage.getItem(LEGACY_OPTOUT_KEY)).toBeNull();
    t += CLASSIC_DWELL_MS;
    hide();
    expect(modes()).toEqual([{ url: "/api/visit", body: '{"v":1,"mode":"classic"}' }]);
  });

  it("clears the stale key even when the visit is not counted, and ignores blocked storage", () => {
    localStorage.setItem(LEGACY_OPTOUT_KEY, "1");
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => true });
    start();
    hide();
    expect(sent).toEqual([]);
    expect(localStorage.getItem(LEGACY_OPTOUT_KEY)).toBeNull();
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => clearLegacyOptOut()).not.toThrow();
  });

  it("counts Do Not Track and Global Privacy Control visitors (owner decision 2026-10-24)", () => {
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, get: () => "1" });
    Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, get: () => true });
    start();
    expect(visits()).toEqual([VISIT]);
    t += CLASSIC_DWELL_MS;
    hide();
    expect(modes()).toHaveLength(1);
    Object.defineProperty(navigator, "doNotTrack", { configurable: true, get: () => null });
    Object.defineProperty(navigator, "globalPrivacyControl", { configurable: true, get: () => undefined });
  });

  it("sends the visit ping as soon as the page is shown, before any hide", () => {
    start();
    expect(sent).toEqual([VISIT]);
    expect(sessionStorage.getItem(VISIT_SESSION_KEY)).toBe("1");
  });

  it("sends one visit ping per tab session: a reload in the same tab does not count again", () => {
    start();
    resetVisitBeacon();
    start();
    expect(visits()).toHaveLength(1);
    sessionStorage.clear();
    resetVisitBeacon();
    start();
    expect(visits()).toHaveLength(2);
  });

  it("waits for a hidden (background or prerendered) page to be shown before the visit ping", () => {
    visibility = "hidden";
    start();
    expect(visits()).toEqual([]);
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(visits()).toEqual([VISIT]);
  });

  it("keeps the visit in memory when sessionStorage is blocked, and retries a refused beacon", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    start();
    hide();
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(visits()).toHaveLength(1);
    vi.restoreAllMocks();
    resetVisitBeacon();
    sent.length = 0;
    let accept = false;
    Object.defineProperty(navigator, "sendBeacon", {
      configurable: true,
      value: (url: string, body: string) => {
        if (accept) sent.push({ url, body });
        return accept;
      },
    });
    start();
    expect(sessionStorage.getItem(VISIT_SESSION_KEY)).toBeNull();
    accept = true;
    hide();
    visibility = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(visits()).toEqual([VISIT]);
  });

  it("never sends a visit ping under automation unless ?visit=1 forces it", () => {
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => true });
    start();
    expect(sent).toEqual([]);
  });

  it("starts once per page lifetime, stores only the tab session flag and sets no cookie", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    start();
    start();
    t += CLASSIC_DWELL_MS;
    hide();
    expect(modes()).toHaveLength(1);
    expect(visits()).toHaveLength(1);
    expect(setItem.mock.calls).toEqual([[VISIT_SESSION_KEY, "1"]]);
    expect(localStorage.length).toBe(0);
    expect(document.cookie).toBe("");
  });

  it("can start again after a cleanup that sent nothing (Strict Mode remount)", () => {
    const stop = start();
    stop();
    start();
    t += CLASSIC_DWELL_MS;
    hide();
    expect(modes()).toHaveLength(1);
  });

  it("tags the visit ping with an allowlisted ?src= channel, and drops any other tag", () => {
    window.history.replaceState({}, "", "/en?src=li");
    start();
    expect(visits()).toEqual([{ url: "/api/visit", body: '{"v":1,"kind":"visit","src":"li"}' }]);
    cleanups.splice(0).forEach((stop) => stop());
    resetVisitBeacon();
    sessionStorage.clear();
    sent.length = 0;
    window.history.replaceState({}, "", "/en?src=https://evil.example");
    start();
    expect(visits()).toEqual([VISIT]);
    window.history.replaceState({}, "", "/");
  });

  it("counts each intent once per tab session, also after the mode ping went out", () => {
    start();
    const link = (attrs: Record<string, string>, text = "x") => {
      const a = document.createElement(attrs.href ? "a" : "button");
      for (const [k, v] of Object.entries(attrs)) a.setAttribute(k, v);
      a.append(document.createElement("span"));
      a.firstElementChild!.textContent = text;
      document.body.append(a);
      return a;
    };
    const mail = link({ href: "mailto:someone@example.com" });
    mail.addEventListener("click", (e) => e.preventDefault());
    (mail.firstElementChild as HTMLElement).click();
    mail.click();
    t += CLASSIC_DWELL_MS;
    hide();
    const li = link({ href: "https://www.linkedin.com/in/someone" });
    li.addEventListener("click", (e) => e.preventDefault());
    li.click();
    link({ "data-hq-intent": "email" }).click();
    expect(intents()).toEqual(["email", "linkedin"]);
    expect(sessionStorage.getItem("hq:intent:email")).toBe("1");
    document.body.replaceChildren();
  });

  it("maps clicks to intents and counts CV opens only where visits count", () => {
    const el = (html: string) => {
      document.body.innerHTML = html;
      return document.body.firstElementChild!.firstElementChild ?? document.body.firstElementChild!;
    };
    expect(intentOf(el('<a href="mailto:a@b.co"><span>a</span></a>'))).toBe("email");
    expect(intentOf(el('<button data-hq-intent="email"><span>Copy</span></button>'))).toBe("email");
    expect(intentOf(el('<a href="https://linkedin.com/in/x"><span>x</span></a>'))).toBe("linkedin");
    expect(intentOf(el('<a href="https://github.com/ShinyQ"><span>x</span></a>'))).toBe("github");
    expect(intentOf(el('<a href="https://evil.example/?linkedin.com/"><span>x</span></a>'))).toBeNull();
    expect(intentOf(el('<a href="/en/labs"><span>x</span></a>'))).toBeNull();
    document.body.replaceChildren();
    countIntent("cv");
    countIntent("cv");
    expect(intents()).toEqual(["cv"]);
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => true });
    sessionStorage.clear();
    resetVisitBeacon();
    countIntent("github");
    expect(intents()).toEqual(["cv"]);
  });
});
