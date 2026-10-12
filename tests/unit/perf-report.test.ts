import { describe, expect, it } from "vitest";
import {
  chunkName,
  entryId,
  isPerfEntry,
  median,
  pagesFromLhrs,
  programBaseline,
  renderChunkDiff,
  renderGates,
  renderLhci,
  renderTimeline,
  type PerfEntry,
} from "../../scripts/perf-report";

const ORIGIN = "http://127.0.0.1:4320";
const lhr = (page: string, items: { url: string; resourceType: string; transferSize: number }[]) => ({
  requestedUrl: `${ORIGIN}${page}`,
  audits: { "network-requests": { details: { items: items.map((i) => ({ ...i, url: `${ORIGIN}${i.url}` })) } } },
});

describe("chunks", () => {
  it("names Next.js chunks by file and other scripts by path", () => {
    expect(chunkName(`${ORIGIN}/_next/static/chunks/0hc43abc.js`)).toBe("0hc43abc.js");
    expect(chunkName("/_next/static/chunks/0hc43abc.js")).toBe("0hc43abc.js");
    expect(chunkName(`${ORIGIN}/sw.js`)).toBe("/sw.js");
  });

  it("reads script transfer sizes per page and keeps the largest of each chunk over runs", () => {
    const a = lhr("/en", [
      { url: "/_next/static/chunks/a.js", resourceType: "Script", transferSize: 1000 },
      { url: "/_next/static/css/x.css", resourceType: "Stylesheet", transferSize: 50 },
    ]);
    const b = lhr("/en", [
      { url: "/_next/static/chunks/a.js", resourceType: "Script", transferSize: 1010 },
      { url: "/_next/static/chunks/b.js", resourceType: "Script", transferSize: 500 },
    ]);
    const c = lhr("/en/quick", [{ url: "/_next/static/chunks/a.js", resourceType: "Script", transferSize: 990 }]);
    expect(pagesFromLhrs([a, b, c])).toEqual({ "/en": { "a.js": 1010, "b.js": 500 }, "/en/quick": { "a.js": 990 } });
  });

  it("diffs chunks against main and reports the budget share", () => {
    const s = renderChunkDiff("/en", { "a.js": 2048, "c.js": 1024 }, { "a.js": 2048, "b.js": 512 }, 4096);
    expect(s.markdown).toContain("Total 3.0 KB, 75% of 4.0 KB, main 2.5 KB, +0.5 KB.");
    expect(s.markdown).toContain("| `b.js` | 0.5 KB | |");
    expect(s.markdown).toContain("| `c.js` | | 1.0 KB |");
    expect(s.warnings).toEqual([]);
    expect(renderChunkDiff("/en", { "a.js": 2048 }, { "a.js": 2048 }).markdown).toContain("Same chunks as main.");
  });

  it("lists the largest chunks without a baseline and warns at 90% of the budget", () => {
    const s = renderChunkDiff("/en", { "a.js": 3800 }, undefined, 4096);
    expect(s.markdown).toContain("no main baseline");
    expect(s.markdown).toContain("| `a.js` | 3.7 KB |");
    expect(s.warnings).toEqual(["/en: 3.7 KB is 93% of the 4.0 KB budget"]);
  });

  it("renders one section per Lighthouse page", () => {
    const s = renderLhci([lhr("/en", [{ url: "/_next/static/chunks/a.js", resourceType: "Script", transferSize: 1024 }])], []);
    expect(s.markdown).toContain("### Page View JavaScript per chunk");
    expect(s.markdown).toContain("#### /en");
    expect(renderLhci([], []).markdown).toContain("No Lighthouse reports found.");
  });
});

describe("gates", () => {
  const head: PerfEntry[] = [
    { kind: "bytes3d", tier: "lite", js: { "x.js": 380 * 1024 }, other: { json: 51_000, font: 139_216 } },
    { kind: "floor", tier: "full", floor: "L1", sceneCalls: 136, postCalls: 18, triangles: 16_103, programs: 52, geometries: 410, textures: 37 },
    { kind: "peak", tier: "lite", scenario: "intro", sceneCalls: 140, postCalls: 0, triangles: 20_000, frames: 75 },
  ];
  const base: PerfEntry[] = [{ kind: "floor", tier: "full", floor: "L1", sceneCalls: 134, postCalls: 18, triangles: 16_103, programs: 52, geometries: 410, textures: 37 }];

  it("renders bytes, floors and peaks with deltas against main and warns near a budget", () => {
    const s = renderGates(head, base);
    expect(s.markdown).toContain("#### 3D JS after the gate (lite)");
    expect(s.markdown).toContain("Total 380.0 KB, 84% of 450.0 KB, no main baseline.");
    expect(s.markdown).toContain("Other 3D-path bytes: font 136.0 KB, json 49.8 KB.");
    expect(s.markdown).toContain("| full | L1 | 136 (+2) | 18 | 16103 | 52 | 410 | 37 |");
    expect(s.markdown).toContain("| lite | intro | 140 | 0 | 20000 | 75 |");
    expect(s.warnings).toEqual(["full L1: 136 scene calls is 91% of the 150 budget", "lite intro: 140 scene calls is 93% of the 150 budget"]);
  });

  it("renders P3's memory entries", () => {
    const s = renderGates([{ kind: "memory", tier: "lite", trips: 10, before: { geometries: 400, textures: 30, programs: 26 }, after: { geometries: 400, textures: 30, programs: 26 }, heapDeltaBytes: 512 * 1024 }], []);
    expect(s.markdown).toContain("| lite | 10 | 0 | 0 | 0 | 0.5 MB |");
  });

  it("says so when there is nothing to report", () => {
    expect(renderGates([], []).markdown).toContain("No perf entries found.");
  });

  it("keeps entry ids stable and recognizes entries", () => {
    expect(head.map(entryId)).toEqual(["bytes3d-lite", "floor-full-L1", "peak-lite-intro"]);
    expect(isPerfEntry(head[0])).toBe(true);
    expect(isPerfEntry({ kind: "nope" })).toBe(false);
    expect(isPerfEntry([])).toBe(false);
  });
});

describe("timeline", () => {
  const t = (run: number, explore: number): PerfEntry => ({
    kind: "timeline",
    profile: "p1",
    scenario: "home",
    run,
    release: "ready",
    marks: { coverFcp: 900, headline: null, bootRelease: 5000, firstFrame: 5000, introStart: 7000, introEnd: 9500, explore, firstDrawer: null },
  });

  it("takes medians and shows the previous nightly run in brackets", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
    const s = renderTimeline([t(1, 9500), t(2, 10500)], [t(1, 12000)]);
    expect(s.markdown).toContain("| p1 | home | ready | 0.90 s (0.90 s) | - | 5.00 s (5.00 s) | 5.00 s (5.00 s) | 7.00 s (7.00 s) | 9.50 s (9.50 s) | 10.00 s (12.00 s) | - |");
    expect(s.warnings).toEqual([]);
  });
});

describe("program baseline", () => {
  it("merges new floor readings into the previous baseline, sorted", () => {
    const floor = (tier: "lite" | "full", f: string, programs: number): PerfEntry => ({ kind: "floor", tier, floor: f, sceneCalls: 100, postCalls: 0, triangles: 1, programs, geometries: 1, textures: 1 });
    const b = programBaseline([floor("lite", "L3", 30), floor("lite", "L1", 26)], { programs: { lite: { L2: 28, L1: 20 }, full: { L1: 52 } } });
    expect(b).toEqual({ programs: { lite: { L1: 26, L2: 28, L3: 30 }, full: { L1: 52 } } });
    expect(Object.keys(b.programs.lite)).toEqual(["L1", "L2", "L3"]);
  });
});
