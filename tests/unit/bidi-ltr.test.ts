import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import realBidi from "bidi-js";
import { describe, expect, it } from "vitest";
import ltrBidi from "@/experience/bidiLtr";
import { ROOT } from "../helpers/import-graph";

/** Strong right-to-left scripts (Hebrew, Arabic, Syriac, Thaana, NKo, Samaritan, Mandaic and their presentation forms) and the explicit RTL marks. */
const RTL = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF\u200F\u202B\u202E\u2067]|[\u{10800}-\u{10FFF}\u{1E800}-\u{1EFFF}]/u;

const files = [
  ...(readdirSync(join(ROOT, "content"), { recursive: true }) as string[]).filter((f) => /\.(json|mdx?)$/.test(f)).map((f) => join("content", f)),
  "messages/en.json",
  "messages/id.json",
];

function strings(value: unknown, out: string[]): string[] {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

describe("left-to-right bidi stand-in (perf 3D-3)", () => {
  it("is aliased for bidi-js in the Turbopack build", () => {
    expect(readFileSync(join(ROOT, "next.config.ts"), "utf8")).toMatch(/"bidi-js":\s*"\.\/src\/experience\/bidiLtr\.ts"/);
  });

  it("finds no right-to-left script in the content or the UI strings", () => {
    const hits = files.filter((file) => RTL.test(readFileSync(join(ROOT, file), "utf8")));
    expect(hits, "right-to-left text needs the real bidi-js: drop the alias in next.config.ts").toEqual([]);
  });

  it("lays out every content and UI string exactly as bidi-js does", () => {
    const real = realBidi();
    const ltr = ltrBidi();
    const texts = files.filter((f) => f.endsWith(".json")).flatMap((file) => strings(JSON.parse(readFileSync(join(ROOT, file), "utf8")), []));
    expect(texts.length).toBeGreaterThan(1000);
    for (const text of texts) {
      const expected = real.getEmbeddingLevels(text, "auto");
      const actual = ltr.getEmbeddingLevels(text);
      expect([...actual.levels], text).toEqual([...expected.levels]);
      expect(ltr.getReorderSegments(), text).toEqual(real.getReorderSegments(text, expected));
    }
  });

  it("mirrors nothing (troika asks only for right-to-left glyphs)", () => {
    expect(ltrBidi().getMirroredCharacter()).toBeNull();
  });
});
