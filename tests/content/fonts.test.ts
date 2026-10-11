import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { brotliDecompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";

/*
 * The preloaded page fonts are subset to the characters the site renders (scripts/subset-fonts.sh),
 * because their bytes sit on the LCP path. This test reads each WOFF2 cmap and fails when content,
 * messages or a component uses a character outside the cuts, or when the files outgrow the budget.
 */

const root = process.cwd();
const FONT_DIR = path.join(root, "src", "assets", "fonts");
const FONTS = ["inter-latin1-wght400-800.woff2", "jetbrains-mono-ascii-wght400-700.woff2", "archivo-ascii-wdth72-92-wght600-800.woff2"];
/** All three files together (bytes); the latin cuts were about 110 KB. */
const BUDGET = 60 * 1024;

/** Symbols that were never in the cuts and render from the system fallback (arrows, box drawing, shapes). */
const FALLBACK: readonly [number, number][] = [
  [0x2190, 0x21ff], // arrows
  [0x2200, 0x2211], // math operators (minus U+2212 is in the cuts)
  [0x2213, 0x22ff],
  [0x2300, 0x23ff], // misc technical (command key)
  [0x2500, 0x257f], // box drawing (README terminal view)
  [0x25a0, 0x25ff], // geometric shapes
  [0x2700, 0x27bf], // dingbats
];

const WOFF2_TAGS = ["cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm", "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern", "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC", "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar", "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty", "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat", "Gloc", "Feat", "Sill"];

/** Code points mapped by a WOFF2 font's cmap (format 4 and 12 subtables). */
function woff2CodePoints(file: Buffer): Set<number> {
  if (file.toString("latin1", 0, 4) !== "wOF2") throw new Error("not a WOFF2 file");
  const numTables = file.readUInt16BE(12);
  let at = 48;
  const base128 = () => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      const byte = file[at++];
      value = value * 128 + (byte & 0x7f);
      if (!(byte & 0x80)) return value;
    }
    throw new Error("bad UIntBase128");
  };
  let offset = 0;
  let cmap: { offset: number; length: number } | null = null;
  for (let i = 0; i < numTables; i++) {
    const flags = file[at++];
    let tag = WOFF2_TAGS[flags & 0x3f];
    if ((flags & 0x3f) === 63) {
      tag = file.toString("latin1", at, at + 4);
      at += 4;
    }
    const version = flags >> 6;
    const origLength = base128();
    const transformed = tag === "glyf" || tag === "loca" ? version === 0 : version !== 0;
    const length = transformed ? base128() : origLength;
    if (tag === "cmap") cmap = { offset, length };
    offset += length;
  }
  if (!cmap) throw new Error("no cmap");
  const data = brotliDecompressSync(file.subarray(at, at + file.readUInt32BE(20)));
  const table = data.subarray(cmap.offset, cmap.offset + cmap.length);
  const points = new Set<number>();
  for (let r = 0; r < table.readUInt16BE(2); r++) {
    const sub = table.subarray(table.readUInt32BE(4 + r * 8 + 4));
    const format = sub.readUInt16BE(0);
    if (format === 4) {
      const segs = sub.readUInt16BE(6) / 2;
      for (let s = 0; s < segs; s++) {
        const end = sub.readUInt16BE(14 + s * 2);
        const start = sub.readUInt16BE(16 + segs * 2 + s * 2);
        for (let c = start; c <= end && c !== 0xffff; c++) points.add(c);
      }
    } else if (format === 12) {
      for (let g = 0; g < sub.readUInt32BE(12); g++) {
        for (let c = sub.readUInt32BE(16 + g * 12); c <= sub.readUInt32BE(20 + g * 12); c++) points.add(c);
      }
    }
  }
  return points;
}

function walk(dir: string, exts: readonly string[], out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.some((ext) => name.endsWith(ext))) out.push(full);
  }
  return out;
}

/** Every non-ASCII character the pages can render: content, messages and component source. */
function renderedCharacters(): Map<string, string> {
  const files = [
    ...walk(path.join(root, "content"), [".json", ".mdx"]),
    ...walk(path.join(root, "messages"), [".json"]),
    ...walk(path.join(root, "src"), [".ts", ".tsx", ".css"]),
  ];
  const found = new Map<string, string>();
  for (const file of files) {
    for (const char of readFileSync(file, "utf8")) {
      const code = char.codePointAt(0)!;
      if (code > 0x7e && !found.has(char)) found.set(char, path.relative(root, file));
    }
  }
  return found;
}

const inFallback = (code: number) => FALLBACK.some(([from, to]) => code >= from && code <= to);
const hex = (code: number) => `U+${code.toString(16).toUpperCase().padStart(4, "0")}`;

describe("page fonts", () => {
  const fonts = FONTS.map((name) => ({ name, bytes: readFileSync(path.join(FONT_DIR, name)) }));

  it("stay within the preload byte budget", () => {
    const total = fonts.reduce((sum, font) => sum + font.bytes.length, 0);
    expect(total).toBeLessThanOrEqual(BUDGET);
  });

  it("cover printable ASCII", () => {
    for (const font of fonts) {
      const points = woff2CodePoints(font.bytes);
      const missing = [];
      for (let c = 0x20; c <= 0x7e; c++) if (!points.has(c)) missing.push(hex(c));
      expect(missing, font.name).toEqual([]);
    }
  });

  it("cover every character the site renders, except fallback symbols", () => {
    const chars = renderedCharacters();
    for (const font of fonts) {
      const points = woff2CodePoints(font.bytes);
      const missing = [...chars]
        .filter(([char]) => !points.has(char.codePointAt(0)!) && !inFallback(char.codePointAt(0)!))
        .map(([char, file]) => `${hex(char.codePointAt(0)!)} ${JSON.stringify(char)} (${file})`);
      expect(missing, font.name).toEqual([]);
    }
  });
});
