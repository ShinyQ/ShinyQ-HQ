// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Analytics, CHUNK_WAIT_MS, IDLE_TIMEOUT_MS, cfBeaconScript } from "@/components/Analytics";
import { LOADER_MARKER } from "../../scripts/defer-scripts";

const TOKEN = "0123456789abcdef0123456789abcdef";

const BEACON = 'script[src="https://static.cloudflareinsights.com/beacon.min.js"]';

function setReadyState(state: DocumentReadyState) {
  Object.defineProperty(document, "readyState", { configurable: true, get: () => state });
}

/** Runs the loader on a page that already finished loading, then lets the idle callback fire. */
function run() {
  setReadyState("complete");
  new Function(cfBeaconScript(TOKEN))();
  vi.runAllTimers();
  return document.querySelector<HTMLScriptElement>(BEACON);
}

describe("Cloudflare Web Analytics beacon guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    vi.useRealTimers();
    Reflect.deleteProperty(document, "readyState");
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("waits for the load event before it injects the beacon", () => {
    setReadyState("loading");
    new Function(cfBeaconScript(TOKEN))();
    vi.runAllTimers();
    expect(document.querySelector(BEACON)).toBeNull();
    setReadyState("complete");
    window.dispatchEvent(new Event("load"));
    expect(document.querySelector(BEACON)).toBeNull();
    vi.runAllTimers();
    expect(document.querySelector(BEACON)).not.toBeNull();
    window.dispatchEvent(new Event("load"));
    vi.runAllTimers();
    expect(document.querySelectorAll(BEACON)).toHaveLength(1);
  });

  it("waits for the deferred app chunk requests, not their downloads", async () => {
    setReadyState("complete");
    new Function(cfBeaconScript(TOKEN))();
    vi.advanceTimersByTime(100);
    expect(document.querySelector(BEACON)).toBeNull();
    const polyfill = document.createElement("script");
    polyfill.src = "http://localhost/_next/static/chunks/polyfills.js";
    polyfill.setAttribute("nomodule", "");
    document.head.appendChild(polyfill);
    await Promise.resolve();
    vi.advanceTimersByTime(100);
    expect(document.querySelector(BEACON)).toBeNull();
    const chunk = document.createElement("script");
    chunk.src = "http://localhost/_next/static/chunks/app.js";
    document.head.appendChild(chunk);
    await Promise.resolve();
    vi.advanceTimersByTime(1);
    expect(document.querySelectorAll(BEACON)).toHaveLength(1);
    vi.runAllTimers();
    expect(document.querySelectorAll(BEACON)).toHaveLength(1);
    chunk.remove();
    polyfill.remove();
  });

  it("goes straight to idle when the chunk scripts are already in the page", () => {
    const chunk = document.createElement("script");
    chunk.src = "http://localhost/_next/static/chunks/app.js";
    document.head.appendChild(chunk);
    setReadyState("complete");
    new Function(cfBeaconScript(TOKEN))();
    vi.advanceTimersByTime(1);
    expect(document.querySelector(BEACON)).not.toBeNull();
    chunk.remove();
  });

  it("never carries the deferred chunk loader's marker (defer-scripts would skip the page)", () => {
    expect(cfBeaconScript(TOKEN)).not.toContain(LOADER_MARKER);
  });

  it("stops waiting for the app chunks after a cap of about a second", () => {
    expect(CHUNK_WAIT_MS).toBeLessThanOrEqual(1000);
    setReadyState("complete");
    new Function(cfBeaconScript(TOKEN))();
    vi.advanceTimersByTime(CHUNK_WAIT_MS - 100);
    expect(document.querySelector(BEACON)).toBeNull();
    vi.advanceTimersByTime(200);
    expect(document.querySelector(BEACON)).not.toBeNull();
  });

  it("injects on idle with a short deadline when requestIdleCallback exists", () => {
    expect(IDLE_TIMEOUT_MS).toBeLessThanOrEqual(1000);
    const idle = vi.fn((cb: () => void, opts?: { timeout?: number }) => {
      expect(opts).toEqual({ timeout: IDLE_TIMEOUT_MS });
      cb();
      return 1;
    });
    vi.stubGlobal("requestIdleCallback", idle);
    setReadyState("complete");
    new Function(cfBeaconScript(TOKEN))();
    expect(idle).not.toHaveBeenCalled();
    vi.advanceTimersByTime(CHUNK_WAIT_MS);
    expect(idle).toHaveBeenCalledTimes(1);
    expect(document.querySelector(BEACON)).not.toBeNull();
  });

  it("injects the cookieless beacon with SPA tracking", () => {
    const script = run();
    expect(script).not.toBeNull();
    expect(JSON.parse(script?.getAttribute("data-cf-beacon") ?? "")).toEqual({ token: TOKEN, spa: true });
  });

  it("loads even with a stale opt-out key from the retired \"Don't count my visits\" switch", () => {
    localStorage.setItem("hq:stats-optout", "1");
    expect(run()).not.toBeNull();
  });

  it("loads nothing in an automated browser (navigator.webdriver)", () => {
    Object.defineProperty(navigator, "webdriver", { configurable: true, get: () => true });
    try {
      expect(run()).toBeNull();
    } finally {
      Reflect.deleteProperty(navigator, "webdriver");
    }
    expect(navigator.webdriver).not.toBe(true);
    expect(run()).not.toBeNull();
  });

  it("still loads when storage is blocked", () => {
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("blocked");
      },
    });
    try {
      expect(run()).not.toBeNull();
    } finally {
      if (original) Object.defineProperty(window, "localStorage", original);
    }
  });

  it("renders an inline guard only when a token is set", () => {
    expect(Analytics({ token: "" })).toBeNull();
    const element = Analytics({ token: TOKEN });
    expect(element?.props.id).toBe("hq-cf-beacon");
    expect(element?.props.dangerouslySetInnerHTML.__html).toBe(cfBeaconScript(TOKEN));
  });

  it("keeps the inline code free of anything but the token and fixed text", () => {
    const code = cfBeaconScript(TOKEN);
    expect(code).not.toContain("hq:stats-optout");
    expect(code).not.toContain("localStorage");
    expect(code).toContain('addEventListener("load"');
    expect(code).toContain('document.readyState==="complete"');
    expect(code).toContain('\\"spa\\":true');
    expect(code).toContain("s.defer=true");
    expect(code).toContain("data-cf-beacon");
    expect(code).toContain("static.cloudflareinsights.com/beacon.min.js");
    expect(code).not.toContain("</script");
  });
});
