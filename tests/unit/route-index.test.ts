import { describe, expect, it } from "vitest";
import { buildRouteIndex } from "@/lib/route-index";
import { allPagePaths } from "@/lib/routes";

describe("buildRouteIndex", () => {
  const index = buildRouteIndex();
  it("lists every page path in both locales with a title", () => {
    expect(index).toHaveLength(allPagePaths().length * 2);
    for (const entry of index) {
      expect(entry.p).toMatch(/^\/(en|id)(\/|$)/);
      expect(entry.t.length).toBeGreaterThan(0);
      expect(entry.t.startsWith("/"), `${entry.p} title falls back to a path`).toBe(false);
    }
    expect(index.find((e) => e.p === "/en/labs/voice-ai-contact-center")?.t).toBe("Realtime Voice AI Contact Center");
  });
  it("stays small", () => expect(JSON.stringify(index).length).toBeLessThan(24_000));
});
