import { afterEach, describe, expect, it, vi } from "vitest";
import { decideTier, isTier, readTierInputs } from "@/lib/gpu-tier";

const desktop = { webgl2: true, renderer: "ANGLE (Apple, Apple M3, OpenGL 4.1)", coarse: false, deviceMemory: 8, cores: 10 };

describe("decideTier", () => {
  it("defaults to full on a capable desktop", () => {
    expect(decideTier(desktop)).toBe("full");
  });

  it("honors a valid ?tier override", () => {
    expect(decideTier({ ...desktop, override: "lite" })).toBe("lite");
    expect(decideTier({ ...desktop, override: "static" })).toBe("static");
    expect(decideTier({ ...desktop, webgl2: false, override: "full" })).toBe("full");
  });

  it("ignores junk overrides", () => {
    expect(decideTier({ ...desktop, override: "ultra" })).toBe("full");
    expect(isTier("ultra")).toBe(false);
  });

  it("falls back to static without WebGL2 or with saveData", () => {
    expect(decideTier({ ...desktop, webgl2: false })).toBe("static");
    expect(decideTier({ ...desktop, saveData: true })).toBe("static");
  });

  it("uses static for software renderers (detect-gpu tier 0)", () => {
    expect(decideTier({ ...desktop, renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device))" })).toBe("static");
    expect(decideTier({ ...desktop, renderer: "llvmpipe (LLVM 15.0.7, 256 bits)" })).toBe("static");
  });

  it("uses lite for phones and weak devices", () => {
    expect(decideTier({ ...desktop, coarse: true })).toBe("lite");
    expect(decideTier({ ...desktop, deviceMemory: 2 })).toBe("lite");
    expect(decideTier({ ...desktop, cores: 2 })).toBe("lite");
  });
});

describe("readTierInputs", () => {
  afterEach(() => vi.unstubAllGlobals());

  function stubBrowser() {
    const getContext = vi.fn(() => null);
    const createElement = vi.fn(() => ({ getContext }));
    vi.stubGlobal("navigator", { hardwareConcurrency: 8 });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    vi.stubGlobal("document", { createElement });
    return { createElement, getContext };
  }

  it("creates no WebGL context when ?tier= forces a tier", () => {
    const { createElement } = stubBrowser();
    for (const tier of ["static", "lite", "full"]) {
      const inputs = readTierInputs(`?tier=${tier}`);
      expect(inputs.override).toBe(tier);
      expect(decideTier(inputs)).toBe(tier);
    }
    expect(createElement).not.toHaveBeenCalled();
  });

  it("still probes without a valid override", () => {
    const { getContext } = stubBrowser();
    expect(readTierInputs("?tier=ultra").webgl2).toBe(false);
    expect(readTierInputs("").webgl2).toBe(false);
    expect(getContext).toHaveBeenCalledTimes(2);
  });
});
