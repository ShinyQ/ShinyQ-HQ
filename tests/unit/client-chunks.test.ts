import { describe, expect, it } from "vitest";
import { chunkLeaks } from "../../scripts/check-client-chunks";

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
