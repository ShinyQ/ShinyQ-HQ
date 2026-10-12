import { describe, expect, it } from "vitest";
import { scanCss, scanFile, scanTree } from "../helpers/edge-accents";

/**
 * Ratchet for R5 P10 (owner, 2026-10-13: "I dont like the left side border colored or top colored"):
 * colored edge stripes allowed in `src`. Empty: every stripe is gone (P9 removed the OG left bar).
 * Any new stripe fails; mark state with a dot or icon chip and `hq-glow` instead (AGENTS.md "Styling").
 */
const KNOWN: string[] = [];

const ids = (list: { id: string }[]) => list.map((e) => e.id).sort();

describe("edge accent detectors", () => {
  it("flag a colored left or top border, a thin edge bar, an inset edge shadow and an inline edge bar", () => {
    const tsx = [
      'const a = <div className="border-l-2 border-cyan px-4" />;',
      "const b = <div className={`border-t-4 ${tone}`} />;",
      'const c = <span className="absolute inset-x-0 top-0 h-0.5 bg-violet/70" />;',
      'const d = <span className="absolute inset-y-0 left-0 w-1 bg-amber" />;',
      'const e = <li className="shadow-[inset_3px_0_0_var(--color-cyan)]" />;',
      'const f = <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, backgroundColor: accent }} />;',
    ].join("\n");
    expect(ids(scanFile("x.tsx", tsx))).toEqual(
      [
        "x.tsx: class: border-l-2 + border-cyan",
        "x.tsx: bar: top h-0.5",
        "x.tsx: bar: side w-1",
        "x.tsx: inset shadow: inset 3px 0 0 var(--color-cyan)",
        "x.tsx: style: side bar width 6",
      ].sort(),
    );
  });

  it("keep neutral structural rules, bottom indicators and full outlines", () => {
    const tsx = [
      'const a = <div className="border-t border-line md:border-t-0 md:border-l md:pl-6" />;',
      'const b = <footer className="border-t border-glass-border px-4" />;',
      'const c = <div className="rounded-lg border border-cyan/60 bg-cyan/10" />;',
      'const d = <button className="border-b-2 border-cyan" />;',
      'const e = <div className="absolute inset-x-0 bottom-4 h-1 bg-cyan" />;',
      'const f = <div className="shadow-[0_12px_40px_rgb(0_0_0/0.45),inset_0_1px_0_rgb(255_255_255/0.05)]" />;',
      'const g = <div style={{ position: "absolute", left: x, top: 0, width: 1, height: H }} />;',
    ].join("\n");
    expect(scanFile("y.tsx", tsx)).toEqual([]);
  });

  it("read CSS declarations, pseudo-element bars and inset shadows", () => {
    const css = [
      ".rows > li { border-top: 1px solid var(--color-line); }",
      ".toc a { border-left: 1px solid var(--color-line-2); }",
      ".quote { border-left: 2px solid var(--color-violet); }",
      '.toc a[aria-current="true"] { border-left-color: var(--color-violet); }',
      '.card::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 3px; background: var(--color-cyan); }',
      '.tab::after { content: ""; position: absolute; left: 18%; right: 18%; bottom: 0; height: 2px; background: var(--color-cyan); }',
      ".glass { box-shadow: 0 12px 40px rgb(0 0 0 / 0.45), inset 0 1px 0 rgb(255 255 255 / 0.05); }",
      ".row { box-shadow: inset 2px 0 0 var(--color-amber); }",
    ].join("\n");
    expect(ids(scanCss("z.css", css))).toEqual(
      [
        "z.css: css: border-left: 2px solid var(--color-violet);",
        "z.css: css: border-left-color: var(--color-violet);",
        "z.css: css bar: .card::before",
        "z.css: inset shadow: inset 2px 0 0 var(--color-amber)",
      ].sort(),
    );
  });
});

describe("src", () => {
  it("has no colored edge stripe beyond the ratchet list", () => {
    expect(ids(scanTree(process.cwd()))).toEqual([...KNOWN].sort());
  });
});
