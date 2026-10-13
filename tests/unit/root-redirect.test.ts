import { describe, expect, it } from "vitest";
import { hoistRootRedirect } from "../../scripts/root-redirect";

const PAGE = '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><link rel="stylesheet" href="/a.css"/></head><body><main><script id="hq-root-redirect">go()</script></main></body></html>';

describe("hoistRootRedirect", () => {
  it("copies the redirect above the stylesheet and keeps the original for hydration", () => {
    const out = hoistRootRedirect(PAGE);
    expect(out.indexOf('<script data-hq-hoisted="">go()</script>')).toBeGreaterThan(out.indexOf('<meta charSet="utf-8"/>'));
    expect(out.indexOf("data-hq-hoisted")).toBeLessThan(out.indexOf('rel="stylesheet"'));
    expect(out).toContain('<script id="hq-root-redirect">go()</script>');
  });

  it("is idempotent and fails loudly without the script", () => {
    const once = hoistRootRedirect(PAGE);
    expect(hoistRootRedirect(once)).toBe(once);
    expect(() => hoistRootRedirect("<html><head></head><body></body></html>")).toThrow(/hq-root-redirect/);
  });
});
