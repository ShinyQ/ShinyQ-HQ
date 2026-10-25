import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Skyline } from "@/components/time-travel/Skyline";
import { SiteContentSchema } from "@/content/schema";
import { buildTimeTravel } from "@/content/time-travel";
import data from "../../content/site-content.json";

const stops = buildTimeTravel(SiteContentSchema.parse(data));
const labels = stops.map((s) => (s.year === null ? "<2019" : String(s.year)));
const names = stops.map((_, i) => `Building ${i}`);
const html = renderToStaticMarkup(<Skyline stops={stops} labels={labels} names={names} title="Skyline" />);

describe("Skyline markup contract", () => {
  it("links every building to its year", () => {
    expect(html.match(/data-tt-link="/g)).toHaveLength(9);
    const hrefs = [...html.matchAll(/<a href="([^"]+)" data-tt-link/g)].map((m) => m[1]);
    expect(hrefs[0]).toBe("#y2019");
    expect(hrefs[3]).toBe("#y2021");
  });

  it("passes the aria labels through", () => {
    for (const name of names) expect(html).toContain(`aria-label="${name}"`);
  });

  it("outlines only the last building", () => {
    const outlines = [...html.matchAll(/<rect[^>]*data-tt-outline="\d+"[^>]*>/g)].map((m) => m[0]);
    expect(outlines).toHaveLength(9);
    expect(outlines.filter((o) => o.includes('visibility="visible"'))).toEqual([outlines[8]]);
  });

  it("renders the year ticks as an aria-hidden HTML row", () => {
    expect(html).toContain('<div class="mt-2 flex" aria-hidden="true">');
    expect(html).not.toContain("<text");
  });
});
