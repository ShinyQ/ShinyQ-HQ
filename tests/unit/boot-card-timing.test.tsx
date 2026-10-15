import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HEADLINE_TIMING_ID } from "@/lib/perf-marks";
import { BootCard } from "@/components/BootCard";

const props = { eyebrow: "HQ", title: "Booting the HQ", lines: ["one"], shown: 1, startLabel: "Boot rover" };

describe("boot card headline timing", () => {
  it("marks the boot card title for Element Timing (the nightly timeline's headline column)", () => {
    const html = renderToStaticMarkup(<BootCard {...props} placeholder />);
    expect(HEADLINE_TIMING_ID).toBe("hq-headline");
    expect(html).toMatch(/<p[^>]*elementtiming="hq-headline"[^>]*>Booting the HQ<\/p>/);
    expect(html.match(/elementtiming=/g)).toHaveLength(1);
  });
});
