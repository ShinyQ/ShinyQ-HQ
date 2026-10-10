import { describe, expect, it } from "vitest";
import { bootFirstScript, shouldBootFirst, splitBootLine, type BootFirstInput } from "@/lib/boot-first";

const base: BootFirstInput = { path: "/en", search: "", storedView: null, hasWebGL2: true, saveData: false };

function runScript(input: { path: string; search?: string; stored?: string | null; webgl2?: boolean; saveData?: boolean }) {
  const attrs = new Map<string, string>();
  const timers: (() => void)[] = [];
  const documentElement = {
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    hasAttribute: (k: string) => attrs.has(k),
    removeAttribute: (k: string) => attrs.delete(k),
  };
  const run = new Function("location", "sessionStorage", "navigator", "document", "WebGL2RenderingContext", "setTimeout", bootFirstScript());
  run(
    { pathname: input.path, search: input.search ?? "" },
    { getItem: () => input.stored ?? null },
    { connection: input.saveData ? { saveData: true } : undefined },
    { documentElement },
    input.webgl2 === false ? undefined : function () {},
    (fn: () => void) => timers.push(fn),
  );
  return { attrs, timers };
}

describe("shouldBootFirst", () => {
  it("boots first on gated routes with WebGL2", () => {
    for (const path of ["/en", "/id/", "/en/journey", "/en/journey/jenius-2024", "/id/labs/voice-ai-contact-center", "/en/library", "/en/contact"]) {
      expect(shouldBootFirst({ ...base, path })).toBe(true);
    }
  });

  it("shows the page on non-gated routes", () => {
    for (const path of ["/en/quick", "/en/cv", "/en/blog/some-post", "/", "/en/unknown", "/fr", "/en/library/x"]) {
      expect(shouldBootFirst({ ...base, path })).toBe(false);
    }
  });

  it("respects tier=static, stored page view, missing WebGL2 and saveData", () => {
    expect(shouldBootFirst({ ...base, search: "?tier=static" })).toBe(false);
    expect(shouldBootFirst({ ...base, search: "?x=1&tier=static" })).toBe(false);
    expect(shouldBootFirst({ ...base, storedView: "page" })).toBe(false);
    expect(shouldBootFirst({ ...base, hasWebGL2: false })).toBe(false);
    expect(shouldBootFirst({ ...base, saveData: true })).toBe(false);
  });

  it("still boots for tier=lite and tier=full", () => {
    expect(shouldBootFirst({ ...base, search: "?tier=lite" })).toBe(true);
    expect(shouldBootFirst({ ...base, search: "?tier=full" })).toBe(true);
  });
});

describe("bootFirstScript", () => {
  it("is valid JS that sets the attribute on a gated route", () => {
    expect(runScript({ path: "/en" }).attrs.get("data-hq-boot")).toBe("1");
  });

  it("leaves the page alone when 3D is not possible or not wanted", () => {
    expect(runScript({ path: "/en/quick" }).attrs.size).toBe(0);
    expect(runScript({ path: "/en", stored: "page" }).attrs.size).toBe(0);
    expect(runScript({ path: "/en", webgl2: false }).attrs.size).toBe(0);
    expect(runScript({ path: "/en", saveData: true }).attrs.size).toBe(0);
  });

  it("arms a safety timeout that reveals the page", () => {
    const { attrs, timers } = runScript({ path: "/en" });
    expect(timers).toHaveLength(1);
    timers[0]();
    expect(attrs.has("data-hq-boot")).toBe(false);
    expect(attrs.get("data-hq-boot-released")).toBe("timeout");
  });

  it("has no em dashes or closing script tags", () => {
    expect(bootFirstScript()).not.toMatch(/\u2014|<\/script/i);
  });
});

describe("splitBootLine", () => {
  it("separates the ok marker from the text", () => {
    expect(splitBootLine("[ ok ] power on")).toEqual({ ok: true, text: "power on" });
    expect(splitBootLine("rover ready ^_^")).toEqual({ ok: false, text: "rover ready ^_^" });
  });
});
