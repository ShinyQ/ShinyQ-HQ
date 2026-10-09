import { describe, expect, it } from "vitest";
import { floorRoute, parseHQUrl, serializeHQUrl, type HQUrlState } from "@/lib/url-sync";

describe("parseHQUrl", () => {
  it("parses floor routes", () => {
    expect(parseHQUrl("/en")).toEqual({ locale: "en", floor: "L1", activeRoom: null, view: null });
    expect(parseHQUrl("/id/")).toEqual({ locale: "id", floor: "L1", activeRoom: null, view: null });
    expect(parseHQUrl("/id/journey")?.floor).toBe("L2");
    expect(parseHQUrl("/en/labs")?.floor).toBe("L3");
    expect(parseHQUrl("/en/library")?.floor).toBe("L4");
    expect(parseHQUrl("/en/contact")?.floor).toBe("RF");
  });

  it("parses rooms and the hologram view", () => {
    expect(parseHQUrl("/en/journey/jenius-2024")).toEqual({ locale: "en", floor: "L2", activeRoom: "L2:jenius-2024", view: null });
    expect(parseHQUrl("/en/labs/voice-ai", "?view=architecture")).toEqual({
      locale: "en",
      floor: "L3",
      activeRoom: "L3:voice-ai",
      view: "architecture",
    });
    expect(parseHQUrl("/en/blog/hello-world", "?view=architecture")).toEqual({
      locale: "en",
      floor: "L4",
      activeRoom: "L4:hello-world",
      view: null,
    });
  });

  it("rejects non-HQ routes", () => {
    expect(parseHQUrl("/")).toBeNull();
    expect(parseHQUrl("/fr")).toBeNull();
    expect(parseHQUrl("/en/quick")).toBeNull();
    expect(parseHQUrl("/en/cv")).toBeNull();
    expect(parseHQUrl("/en/contact/x")).toBeNull();
    expect(parseHQUrl("/en/labs/Bad_Slug")).toBeNull();
    expect(parseHQUrl("/en/labs/a/b")).toBeNull();
  });
});

describe("serializeHQUrl", () => {
  const cases: [HQUrlState, string][] = [
    [{ locale: "en", floor: "L1", activeRoom: null, view: null }, "/en"],
    [{ locale: "id", floor: "L2", activeRoom: null, view: null }, "/id/journey"],
    [{ locale: "en", floor: "L3", activeRoom: "L3:voice-ai", view: "architecture" }, "/en/labs/voice-ai?view=architecture"],
    [{ locale: "en", floor: "L3", activeRoom: "L3:voice-ai", view: null }, "/en/labs/voice-ai"],
    [{ locale: "en", floor: "L2", activeRoom: "L2:jenius-2024", view: null }, "/en/journey/jenius-2024"],
    [{ locale: "en", floor: "L4", activeRoom: "L4:hello", view: null }, "/en/blog/hello"],
    [{ locale: "en", floor: "RF", activeRoom: null, view: null }, "/en/contact"],
  ];

  it.each(cases)("serializes %j", (state, url) => {
    expect(serializeHQUrl(state)).toBe(url);
  });

  it("round-trips through parse", () => {
    for (const [state, url] of cases) {
      const [pathname, search = ""] = url.split("?");
      expect(parseHQUrl(pathname, search ? `?${search}` : "")).toEqual(state);
    }
  });

  it("maps rooms without pages to their floor route", () => {
    expect(serializeHQUrl({ locale: "en", floor: "L1", activeRoom: "RF:contact", view: null })).toBe("/en/contact");
    expect(serializeHQUrl({ locale: "en", floor: "L1", activeRoom: "L1:skills", view: null })).toBe("/en");
  });

  it("exposes floor routes", () => {
    expect(floorRoute("L3")).toBe("/labs");
  });
});
