// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { Analytics, cfBeaconScript } from "@/components/Analytics";
import { STATS_OPTOUT_KEY } from "@/lib/stats/optout";

const TOKEN = "0123456789abcdef0123456789abcdef";

function run() {
  new Function(cfBeaconScript(TOKEN))();
  return document.querySelector<HTMLScriptElement>('script[src="https://static.cloudflareinsights.com/beacon.min.js"]');
}

describe("Cloudflare Web Analytics beacon guard", () => {
  beforeEach(() => {
    localStorage.clear();
    document.body.innerHTML = "";
  });

  it("injects the cookieless beacon with SPA tracking", () => {
    const script = run();
    expect(script).not.toBeNull();
    expect(JSON.parse(script?.getAttribute("data-cf-beacon") ?? "")).toEqual({ token: TOKEN, spa: true });
  });

  it("loads nothing when the visitor chose not to be counted", () => {
    localStorage.setItem(STATS_OPTOUT_KEY, "1");
    expect(run()).toBeNull();
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
    expect(code).toContain(STATS_OPTOUT_KEY);
    expect(code).toContain("static.cloudflareinsights.com/beacon.min.js");
    expect(code).not.toContain("</script");
  });
});
