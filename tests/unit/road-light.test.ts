import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Floor layouts import the road kit, and the store imports the layouts through `experience/config`
 * on every page. The navgrid (A*, region labels, heap) is needed only by the 3D Director, so the
 * road kit must not import it; `roadRoute` lives in `nav/roadRoute.ts` (Lighthouse script budget).
 */
describe("nav/road.ts stays free of the navgrid", () => {
  it("has no import of ./navgrid", () => {
    expect(readFileSync("src/experience/nav/road.ts", "utf8")).not.toMatch(/from "\.\/navgrid"/);
  });
});
