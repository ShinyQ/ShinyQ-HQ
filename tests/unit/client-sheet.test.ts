import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ANY, LAZY_SOURCES_IMPORT, specificity, splitClientSheet } from "../../scripts/client-sheet/split.mjs";
import { CLIENT_ENTRIES, CLIENT_SHEET, classicFiles, lazyOnlyFiles, lazySourcePaths, readRepoFile } from "../../scripts/client-sheet/sources";

const u = (css: string) => `@layer utilities{${css}}`;
/** Selectors of the client sheet in order. */
const selectors = (css: string) => [...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter((s) => !s.startsWith("@"));

describe("splitClientSheet", () => {
  it("keeps the client's own rules and drops the Classic ones", () => {
    const out = splitClientSheet(u(".a{color:red}.b{color:blue}.c{display:flex}"), u(".a{color:red}.c{display:flex}"));
    expect(selectors(out)).toEqual([".b"]);
  });

  it("copies a later Classic rule that can override a client rule, so it still wins after the Classic sheet", () => {
    const full = u(".p-\\[13px\\]{padding:13px}.flex{display:flex}@media (width>=40rem){.sm\\:p-4{padding:1rem}.sm\\:flex{display:flex}}");
    const classic = u(".flex{display:flex}@media (width>=40rem){.sm\\:p-4{padding:1rem}.sm\\:flex{display:flex}}");
    const out = splitClientSheet(full, classic);
    expect(selectors(out)).toEqual([".p-\\[13px\\]", ".sm\\:p-4"]);
    expect(out).toContain("@media (width>=40rem)");
  });

  it("does not copy a Classic rule written earlier or at another specificity", () => {
    const full = u(".p-2{padding:8px}.p-\\[13px\\]{padding:13px}.hover\\:p-4:hover{padding:1rem}");
    const out = splitClientSheet(full, u(".p-2{padding:8px}.hover\\:p-4:hover{padding:1rem}"));
    expect(selectors(out)).toEqual([".p-\\[13px\\]"]);
  });

  it("closes the copies over shared properties", () => {
    const full = u(".x{width:1px}.y{width:2px;height:2px}.z{height:3px}.w{color:red}");
    const out = splitClientSheet(full, u(".y{width:2px;height:2px}.z{height:3px}.w{color:red}"));
    expect(selectors(out)).toEqual([".x", ".y", ".z"]);
  });

  it("reads logical sides, the border parts and the font shorthand", () => {
    const full = u(".px-1{padding-inline:4px}.pl-2{padding-left:8px}.pt-2{padding-top:8px}.bc{border-top-color:red}.bw{border-width:1px}.bt{border-top:1px solid}.bs{border-left-style:solid}");
    const classic = u(".pl-2{padding-left:8px}.pt-2{padding-top:8px}.bw{border-width:1px}.bt{border-top:1px solid}.bs{border-left-style:solid}");
    expect(selectors(splitClientSheet(full, classic))).toEqual([".px-1", ".pl-2", ".bc", ".bt"]);
    const fonts = u(".f{font:12px a}.text-sm{font-size:14px}.fs{font-size:1px}.fw{font-weight:700}");
    expect(selectors(splitClientSheet(fonts, u(".text-sm{font-size:14px}.fw{font-weight:700}")))).toEqual([".f", ".text-sm", ".fs", ".fw"]);
    const longhand = u(".fs{font-size:1px}.fw{font-weight:700}");
    expect(selectors(splitClientSheet(longhand, u(".fw{font-weight:700}")))).toEqual([".fs"]);
  });

  it("keeps normal and important declarations apart", () => {
    const out = splitClientSheet(u(".a{color:red!important}.b{color:blue}"), u(".b{color:blue}"));
    expect(selectors(out)).toEqual([".a"]);
  });

  it("adds only the theme variables, properties and keyframes the Classic sheet lacks, and keeps layer statements", () => {
    const full = "@layer theme,base,components,utilities;@layer theme{:root,:host{--a:1;--b:2}}@property --tw-x{syntax:\"*\";inherits:false}@keyframes spin{to{rotate:1turn}}@keyframes ping{to{opacity:0}}";
    const classic = "@layer theme,base,components,utilities;@layer theme{:root,:host{--a:1}}@keyframes ping{to{opacity:0}}";
    const out = splitClientSheet(full, classic);
    expect(out).toContain("@layer theme,base,components,utilities");
    expect(out).toContain("--b:2");
    expect(out).not.toContain("--a");
    expect(out).toContain("@property --tw-x");
    expect(out).toContain("@keyframes spin");
    expect(out).not.toContain("@keyframes ping");
  });

  it("refuses nested CSS", () => {
    expect(() => splitClientSheet(".a{&:hover{color:red}}", "")).toThrow(/flat CSS/);
  });
});

describe("specificity", () => {
  it.each([
    [".a", 1000],
    [".hover\\:x:hover", 2000],
    [".group-hover\\:x:is(:where(.group):hover *)", 2000],
    [":where(.x>:not(:last-child))", 0],
    [".a::before", 1001],
    [".a:before", 1001],
    ["html", 1],
    ["input::placeholder", 2],
    ["#id .a", 1001000],
    [".\\31 0", 1000],
    ['[data-x="a]b"]', 1000],
    [".x:nth-child(2 of .y)", ANY],
    ["& .a", ANY],
  ])("%s", (selector, expected) => expect(specificity(selector)).toBe(expected));
});

describe("lazy sources", () => {
  const classic = classicFiles();
  const lazy = lazyOnlyFiles(readRepoFile, classic);
  const sheetImport = /^import\s+["']@\/app\/client-sheet\.css["'];?$/m;

  it("keeps the Classic layout, its islands and the dev pages in the Classic set", () => {
    for (const file of ["src/app/[locale]/layout.tsx", "src/hud/ask/AskDock.tsx", "src/hud/MissionHud.tsx", "src/experience/ExperienceGate.tsx", "src/components/SiteHeader.tsx"]) {
      expect(classic.has(file), file).toBe(true);
    }
    expect(lazy).toContain("src/hud/Hud.tsx");
    expect(lazy).toContain("src/experience/Experience.tsx");
  });

  it("never skips a file the Classic pages load", () => {
    const paths = lazySourcePaths(lazy, classic).map((p) => `src/app/${p}`.replace(/^src\/app\/\.\.\//, "src/"));
    for (const file of classic) expect(paths.some((p) => file === p || file.startsWith(`${p}/`)), file).toBe(false);
  });

  it("loads the client sheet only through the client entries", () => {
    for (const entry of CLIENT_ENTRIES) expect(readRepoFile(entry), entry).toMatch(sheetImport);
    expect(classic.has(CLIENT_SHEET)).toBe(false);
    const importers = [...classic].filter((f) => /\.(ts|tsx)$/.test(f) && sheetImport.test(readRepoFile(f) ?? ""));
    expect(importers).toEqual([]);
  });

  it("globals.css imports the lazy sources once", () => {
    expect(readFileSync("src/app/globals.css", "utf8").split(LAZY_SOURCES_IMPORT)).toHaveLength(2);
  });
});
