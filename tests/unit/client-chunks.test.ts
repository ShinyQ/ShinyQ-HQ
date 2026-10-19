import { describe, expect, it } from "vitest";
import { chunkLeaks, floorLayoutLeaks, pageChunks } from "../../scripts/check-client-chunks";

describe("client chunk gate", () => {
  it("flags zod, the content loader and the dataset", () => {
    const leaks = chunkLeaks([
      { name: "a.js", text: "var t={_zod:{def:1}}" },
      { name: "b.js", text: "require('fs').readFileSync(p)" },
      { name: "c.js", text: 'fetch("content/site-content.json")' },
      { name: "d.js", text: "console.log('fine')" },
    ]);
    expect(leaks).toEqual(["a.js: zod (_zod)", "b.js: content loader (readFileSync)", "c.js: dataset (site-content)"]);
  });

  it("passes clean chunks", () => {
    expect(chunkLeaks([{ name: "a.js", text: "export const LOCALES=['en','id']" }])).toEqual([]);
  });
});

describe("Page View floor layout gate (perf item 3)", () => {
  it("lists the chunks a page loads, once each", () => {
    const html =
      '<script src="/_next/static/chunks/a1.js" async></script><link rel="preload" href="/_next/static/chunks/b2.js"/>' +
      '<script>self.__next_f.push([1,"0:[\\"/_next/static/chunks/a1.js\\"]"])</script>';
    expect(pageChunks(html)).toEqual(["a1.js", "b2.js"]);
  });

  it("flags a page chunk that carries a floor layout", () => {
    const leaks = floorLayoutLeaks([
      { name: "x.js", text: 'zones.push({id:"L3:overview",zoom:1})' },
      { name: "y.js", text: 'const z={id:"L1:arrival"}' },
      { name: "z.js", text: 'const room="L1:visits",floors=["B1","L1"]' },
    ]);
    expect(leaks).toEqual(["x.js: floor layout (L3 Project Roads, \"L3:overview\")", "y.js: floor layout (experience/config, \"L1:arrival\")"]);
  });
});
