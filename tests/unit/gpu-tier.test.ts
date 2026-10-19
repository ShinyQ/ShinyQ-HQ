import { afterEach, describe, expect, it, vi } from "vitest";
import { applyQualityPref, decideTier, isTier, readTierInputs } from "@/lib/gpu-tier";

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

describe("decideTier on known-weak integrated GPUs", () => {
  const strong = { webgl2: true, coarse: false, deviceMemory: 8, cores: 8 };

  it.each([
    "ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Intel, Intel(R) UHD Graphics 620 (0x00005917) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Intel, Intel(R) UHD Graphics (0x00009A78) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (Intel(R) HD Graphics 4600 Direct3D11 vs_5_0 ps_5_0)",
    "Intel(R) HD Graphics 520",
    "Intel(R) HD Graphics P530",
    "ANGLE (Intel Inc., Intel(R) HD Graphics 6000, OpenGL 4.1)",
    "ANGLE (Intel, ANGLE Metal Renderer: Intel(R) UHD Graphics 630, Unspecified Version)",
    "Intel HD Graphics 5000 OpenGL Engine",
    "Mesa Intel(R) UHD Graphics 620 (KBL GT2)",
    "Mesa DRI Intel(R) HD Graphics 620 (Kabylake GT2)",
    "ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)",
    "Mali-G52",
    "Mali-G52 MC2",
    "Mali-G52 2EE MC2",
    "ANGLE (ARM, Mali-G52 MC2, OpenGL ES 3.2)",
    "Mali-G51 MP4",
    "Mali-G31 MP2",
    "Mali-T860",
    "Mali-T830 MP2",
    "Mali-400 MP",
    "Mali-450 MP",
    "Adreno (TM) 506",
    "Adreno (TM) 418",
    "Adreno (TM) 308",
    "Adreno (TM) 540",
    "ANGLE (Qualcomm, Adreno (TM) 506, OpenGL ES 3.2)",
    "ANGLE (Qualcomm, Qualcomm(R) Adreno(TM) 540 GPU Direct3D11 vs_5_0 ps_5_0, D3D11)",
  ])("starts %s on lite", (renderer) => {
    expect(decideTier({ ...strong, renderer })).toBe("lite");
  });

  it.each([
    "ANGLE (Intel, Intel(R) Iris(R) Xe Graphics (0x00009A49) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Mesa Intel(R) Xe Graphics (TGL GT2)",
    "ANGLE (Intel Inc., Intel(R) Iris(TM) Plus Graphics 655, OpenGL 4.1)",
    "Intel Iris Pro OpenGL Engine",
    "ANGLE (Intel, Intel(R) Iris(R) Graphics 6100 Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Intel(R) Arc(TM) A770",
    "ANGLE (Intel, Intel(R) Arc(TM) Graphics (0x00007D55) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "Mesa Intel(R) Graphics (ADL GT2)",
    "ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)",
    "Apple GPU",
    "Mali-G710",
    "Mali-G710 MC10",
    "Mali-G76 MC4",
    "Adreno (TM) 650",
    "Adreno (TM) 618",
    "ANGLE (Qualcomm, Qualcomm(R) Adreno(TM) 680 GPU Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "NVIDIA GeForce RTX 3060",
    "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (0x00002504) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "ANGLE (AMD, AMD Radeon(TM) Graphics (0x00001638) Direct3D11 vs_5_0 ps_5_0, D3D11)",
    "AMD Radeon HD 7700 Series",
  ])("keeps %s on full", (renderer) => {
    expect(decideTier({ ...strong, renderer })).toBe("full");
  });

  // Firefox replaces the renderer with a coarse bucket ending in ", or similar": every Intel iGPU, Iris Xe
  // included, reads "Intel(R) HD Graphics", so a bucket is not a known-weak GPU and keeps today's tier.
  it.each([
    "ANGLE (Intel, Intel(R) HD Graphics Direct3D11 vs_5_0 ps_5_0), or similar",
    "ANGLE (Intel, Intel(R) HD Graphics 400 Direct3D11 vs_5_0 ps_5_0), or similar",
    "Intel(R) HD Graphics 400, or similar",
    "Mali-T760, or similar",
  ])("keeps the Firefox bucket %s on today's tier", (renderer) => {
    expect(decideTier({ ...strong, renderer })).toBe("full");
  });

  it("keeps a missing renderer on full", () => {
    expect(decideTier({ ...strong, renderer: undefined })).toBe("full");
  });

  it("still uses static for software renderers", () => {
    expect(decideTier({ ...strong, renderer: "ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)" })).toBe("static");
    expect(decideTier({ ...strong, webgl2: false, renderer: "Intel(R) HD Graphics 520" })).toBe("static");
    expect(decideTier({ ...strong, saveData: true, renderer: "Mali-G52" })).toBe("static");
  });

  it("lets a ?tier override win", () => {
    expect(decideTier({ ...strong, renderer: "Intel(R) HD Graphics 520", override: "full" })).toBe("full");
    expect(decideTier({ ...strong, renderer: "Adreno (TM) 506", override: "static" })).toBe("static");
  });

  it("lets the graphics quality preference lift a weak GPU to full", () => {
    const detected = decideTier({ ...strong, renderer: "Intel(R) HD Graphics 520" });
    expect(applyQualityPref(detected, "full", false)).toBe("full");
    expect(applyQualityPref(detected, "auto", false)).toBe("lite");
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
