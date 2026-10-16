// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chooseView, currentView, getViewPreference, setViewPreference, subscribeViewPreference, VIEW_EVENT } from "@/lib/view-pref";

const cleanups: Array<() => void> = [];

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  history.replaceState(null, "", "/en/labs");
});

afterEach(() => {
  while (cleanups.length) cleanups.pop()?.();
});

describe("view-pref", () => {
  it("currentView follows the URL, then the tab, then the preference, and pins the tab", () => {
    history.replaceState(null, "", "/en/labs?view=classic");
    expect(currentView()).toBe("page");
    expect(sessionStorage.getItem("hq:view")).toBe("page");
    history.replaceState(null, "", "/en/labs");
    expect(currentView()).toBe("page");
    sessionStorage.clear();
    localStorage.setItem("hq:view", "page");
    expect(currentView()).toBe("page");
  });

  it("chooseView writes the tab, the preference and the URL, and tells listeners", () => {
    const seen: string[] = [];
    const onTab = () => seen.push("tab");
    window.addEventListener(VIEW_EVENT, onTab);
    cleanups.push(() => window.removeEventListener(VIEW_EVENT, onTab));
    cleanups.push(subscribeViewPreference(() => seen.push("pref")));
    history.replaceState(null, "", "/en/labs?tier=lite#all");
    chooseView("page");
    expect(location.search).toBe("?tier=lite&view=classic");
    expect(location.hash).toBe("#all");
    expect(getViewPreference()).toBe("page");
    chooseView("3d");
    expect(location.search).toBe("?tier=lite");
    expect(sessionStorage.getItem("hq:view")).toBe("3d");
    expect(seen).toContain("tab");
    expect(seen).toContain("pref");
  });

  it("setViewPreference only changes new tabs", () => {
    sessionStorage.setItem("hq:view", "3d");
    setViewPreference("page");
    expect(currentView()).toBe("3d");
    expect(getViewPreference()).toBe("page");
  });
});
