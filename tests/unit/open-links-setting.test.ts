// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { SETTINGS } from "@/hud/settings/defs";
import { openLinks } from "@/hud/settings/defs/open-links";
import { getViewPreference, subscribeViewPreference } from "@/lib/view-pref";
import { VIEW_KEY } from "@/lib/view-param";

const control = openLinks.control as Extract<typeof openLinks.control, { kind: "choice" }>;

describe("Open links in setting", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  it("defaults to 3D when no preference is stored", () => {
    expect(control.get()).toBe("3d");
  });

  it("stores the Classic site preference through the view-pref helper", () => {
    control.set("page");
    expect(getViewPreference()).toBe("page");
    expect(window.localStorage.getItem(VIEW_KEY)).toBe("page");
    expect(control.get()).toBe("page");
  });

  it("maps unknown values to 3D", () => {
    control.set("page");
    control.set("anything");
    expect(getViewPreference()).toBe("3d");
  });

  it("notifies subscribers on change and unsubscribes cleanly", () => {
    let calls = 0;
    const listener = () => {
      calls += 1;
    };
    const unsubscribe = openLinks.subscribe(listener);
    control.set("page");
    expect(calls).toBe(1);
    unsubscribe();
    control.set("3d");
    expect(calls).toBe(1);
  });

  it("is registered in the general group at order 20", () => {
    const def = SETTINGS.find((s) => s.id === "open-links");
    expect(def).toBeDefined();
    expect(def?.group).toBe("general");
    expect(def?.order).toBe(20);
    expect(def?.subscribe).toBe(subscribeViewPreference);
  });

  it.each([
    ["en", en],
    ["id", id],
  ])("resolves every key used by the setting in %s messages", (_name, messages) => {
    const settings = (messages as { hud: { settings?: Record<string, unknown> } }).hud.settings;
    expect(settings).toBeDefined();
    const resolve = (key: string) => key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown>)?.[part], settings);
    const keys = [openLinks.labelKey, openLinks.hintKey, ...control.options.map((o) => o.labelKey)];
    for (const key of keys) {
      expect(typeof resolve(key!), key).toBe("string");
    }
  });
});
