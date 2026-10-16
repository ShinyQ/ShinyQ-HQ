import { describe, expect, it } from "vitest";
import { decideView, normalizeViewSearch, shareUrls, threeDPath, viewHref } from "@/lib/view-param";

describe("decideView", () => {
  it("an explicit parameter wins over the tab and the preference", () => {
    expect(decideView("?view=classic", "3d", "3d")).toEqual({ view: "page", explicit: "page" });
    expect(decideView("?tier=lite&view=page", null, null)).toEqual({ view: "page", explicit: "page" });
    expect(decideView("?view=3d", "page", "page")).toEqual({ view: "3d", explicit: "3d" });
    expect(decideView("?view=architecture", "page", "page")).toEqual({ view: "3d", explicit: "3d" });
  });
  it("then this tab, then the preference, then 3D", () => {
    expect(decideView("", "page", "3d")).toEqual({ view: "page", explicit: null });
    expect(decideView("", null, "page")).toEqual({ view: "page", explicit: null });
    expect(decideView("", "junk", "junk")).toEqual({ view: "3d", explicit: null });
    expect(decideView("?view=other", null, null)).toEqual({ view: "3d", explicit: null });
  });
});

describe("normalizeViewSearch", () => {
  it("Classic keeps other parameters and ends with view=classic", () => {
    expect(normalizeViewSearch("", "page")).toBe("?view=classic");
    expect(normalizeViewSearch("?view=page&tier=lite", "page")).toBe("?tier=lite&view=classic");
    expect(normalizeViewSearch("?wing=ai&view=classic", "page")).toBe("?wing=ai&view=classic");
    expect(normalizeViewSearch("?view=architecture", "page")).toBe("?view=classic");
  });
  it("3D drops the view choice but keeps the hologram view", () => {
    expect(normalizeViewSearch("?view=classic&tier=lite", "3d")).toBe("?tier=lite");
    expect(normalizeViewSearch("?view=3d", "3d")).toBe("");
    expect(normalizeViewSearch("?view=architecture", "3d")).toBe("?view=architecture");
    expect(normalizeViewSearch("", "3d")).toBe("");
  });
});

describe("viewHref", () => {
  const base = "https://kurniadi.pages.dev/en/labs?view=classic";
  it("adds view=classic to internal page links, keeping query and hash", () => {
    expect(viewHref("/en/journey", "page", base)).toBe("/en/journey?view=classic");
    expect(viewHref("/id/labs/clearbox#gallery", "page", base)).toBe("/id/labs/clearbox?view=classic#gallery");
    expect(viewHref("?wing=ai", "page", base)).toBe("/en/labs?wing=ai&view=classic");
  });
  it("leaves files, hashes, other origins and already-right links alone", () => {
    expect(viewHref("/cv/kurniadi.pdf", "page", base)).toBeNull();
    expect(viewHref("/og/en.jpg", "page", base)).toBeNull();
    expect(viewHref("#main", "page", base)).toBeNull();
    expect(viewHref("https://github.com/ShinyQ", "page", base)).toBeNull();
    expect(viewHref("mailto:a@b.c", "page", base)).toBeNull();
    expect(viewHref("/en?view=classic", "page", base)).toBeNull();
  });
  it("3D strips the parameter again", () => {
    expect(viewHref("/en/journey?view=classic", "3d", base)).toBe("/en/journey");
    expect(viewHref("/en/journey", "3d", base)).toBeNull();
  });
});

describe("threeDPath", () => {
  it("keeps gated routes and maps the rest to their floor", () => {
    expect(threeDPath("/en/labs/clearbox")).toBe("/en/labs/clearbox");
    expect(threeDPath("/id")).toBe("/id");
    expect(threeDPath("/en/blog/some-post")).toBe("/en/library");
    expect(threeDPath("/en/quick")).toBe("/en");
  });
});

describe("shareUrls", () => {
  const origin = "https://kurniadi.pages.dev";
  it("case study: Classic with the parameter, 3D without", () => {
    expect(shareUrls(origin, { pathname: "/en/labs/clearbox", search: "?view=classic&tier=lite", hash: "" })).toEqual({
      classic: "https://kurniadi.pages.dev/en/labs/clearbox?view=classic",
      threeD: "https://kurniadi.pages.dev/en/labs/clearbox",
    });
  });
  it("3D keeps the hash and the hologram view", () => {
    expect(shareUrls(origin, { pathname: "/en/labs/clearbox", search: "?view=architecture", hash: "" }).threeD).toBe(
      "https://kurniadi.pages.dev/en/labs/clearbox?view=architecture",
    );
    expect(shareUrls(origin, { pathname: "/en", search: "", hash: "#visits" })).toEqual({
      classic: "https://kurniadi.pages.dev/en?view=classic#visits",
      threeD: "https://kurniadi.pages.dev/en#visits",
    });
  });
  it("posts open the Writing floor in 3D", () => {
    expect(shareUrls(origin, { pathname: "/en/blog/some-post", search: "", hash: "" }).threeD).toBe("https://kurniadi.pages.dev/en/library");
  });
});
