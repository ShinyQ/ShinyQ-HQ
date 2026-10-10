import { describe, expect, it } from "vitest";
import { bootFirstScript, shouldBootFirst, splitBootLine, type BootFirstInput } from "@/lib/boot-first";

const base: BootFirstInput = { path: "/en", search: "", storedView: null, hasWebGL2: true, saveData: false };

interface ScriptInput {
  path: string;
  search?: string;
  stored?: string | null;
  probe?: string | null;
  webgl2?: boolean;
  saveData?: boolean;
  ua?: string;
  /** What canvas.getContext("webgl2") reports in the post-paint probe. */
  gl?: { renderer: string } | null;
}

function runScript(input: ScriptInput) {
  const attrs = new Map<string, string>();
  const session = new Map<string, string>();
  if (input.stored) session.set("hq:view", input.stored);
  if (input.probe) session.set("hq:probe", input.probe);
  const timers: { fn: () => void; ms: number }[] = [];
  const frames: (() => void)[] = [];
  const win: { __hqProbe?: unknown } = {};
  const documentElement = {
    setAttribute: (k: string, v: string) => attrs.set(k, v),
    hasAttribute: (k: string) => attrs.has(k),
    removeAttribute: (k: string) => attrs.delete(k),
  };
  const gl = input.gl
    ? { RENDERER: 1, getExtension: (n: string) => (n === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 2 } : null), getParameter: () => input.gl!.renderer }
    : null;
  const document = { documentElement, createElement: () => ({ getContext: () => gl }) };
  const run = new Function("location", "sessionStorage", "navigator", "document", "WebGL2RenderingContext", "setTimeout", "requestAnimationFrame", "window", bootFirstScript());
  run(
    { pathname: input.path, search: input.search ?? "" },
    { getItem: (k: string) => session.get(k) ?? null, setItem: (k: string, v: string) => session.set(k, v) },
    { connection: input.saveData ? { saveData: true } : undefined, userAgent: input.ua ?? "Mozilla/5.0" },
    document,
    input.webgl2 === false ? undefined : function () {},
    (fn: () => void, ms: number) => timers.push({ fn, ms }),
    (fn: () => void) => frames.push(fn),
    win,
  );
  /** Runs the first animation frame and the probe it schedules. */
  const paint = () => {
    frames.splice(0).forEach((f) => f());
    timers.filter((t) => t.ms === 0).forEach((t) => t.fn());
  };
  return { attrs, timers, session, win, paint };
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

  it("leaves crawlers and Lighthouse on the page", () => {
    for (const userAgent of [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
    ]) {
      expect(shouldBootFirst({ ...base, userAgent })).toBe(false);
    }
    expect(shouldBootFirst({ ...base, userAgent: "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/140.0 Safari/537.36" })).toBe(true);
  });

  it("skips the cover once this session probed static, unless a 3D tier is forced", () => {
    expect(shouldBootFirst({ ...base, probe: "static" })).toBe(false);
    expect(shouldBootFirst({ ...base, probe: "static", search: "?tier=lite" })).toBe(true);
    expect(shouldBootFirst({ ...base, probe: "static", search: "?tier=full" })).toBe(true);
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
    expect(runScript({ path: "/en", probe: "static" }).attrs.size).toBe(0);
    expect(runScript({ path: "/en", ua: "Chrome-Lighthouse" }).attrs.size).toBe(0);
  });

  it("arms a safety timeout that reveals the page", () => {
    const { attrs, timers } = runScript({ path: "/en" });
    const safety = timers.find((t) => t.ms === 8000);
    expect(safety).toBeDefined();
    safety!.fn();
    expect(attrs.has("data-hq-boot")).toBe(false);
    expect(attrs.get("data-hq-boot-released")).toBe("timeout");
  });

  it("keeps the cover on a GPU after the post-paint probe and shares the probe with the gate", () => {
    const r = runScript({ path: "/en", gl: { renderer: "ANGLE (Apple, Apple M2, OpenGL 4.1)" } });
    r.paint();
    expect(r.attrs.get("data-hq-boot")).toBe("1");
    expect(r.win.__hqProbe).toEqual({ webgl2: true, renderer: "ANGLE (Apple, Apple M2, OpenGL 4.1)" });
    expect(r.session.has("hq:probe")).toBe(false);
  });

  it("releases the cover right after first paint on a software renderer and remembers it", () => {
    for (const gl of [{ renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))" }, null]) {
      const r = runScript({ path: "/en", gl });
      expect(r.attrs.get("data-hq-boot")).toBe("1");
      r.paint();
      expect(r.attrs.has("data-hq-boot")).toBe(false);
      expect(r.attrs.get("data-hq-boot-released")).toBe("static");
      expect(r.session.get("hq:probe")).toBe("static");
    }
  });

  it("lets a ?tier= override decide instead of the probe", () => {
    const r = runScript({ path: "/en", search: "?tier=lite", gl: { renderer: "SwiftShader" } });
    r.paint();
    expect(r.attrs.get("data-hq-boot")).toBe("1");
    expect(r.session.has("hq:probe")).toBe(false);
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
