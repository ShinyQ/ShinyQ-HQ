import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectStrings,
  exportBuildIds,
  findForbiddenPatterns,
  findTerms,
  leafForbiddenPatterns,
  loadAllowlist,
  maskBuildTokens,
  parseTermList,
  scanBuildOutput,
} from "@/content/safety";

describe("parseTermList", () => {
  it("supports comments, lines and commas", () => {
    expect(parseTermList("# c\nfoo, bar\n\n/baz/ # trailing")).toEqual(["foo", "bar", "/baz/"]);
  });
});

describe("product allowlist (C3, revised 2026-10-10)", () => {
  it("loads the product names that feed the Ask entity allowlist", () => {
    expect(loadAllowlist()).toEqual(expect.arrayContaining(["ARIA", "Pris.AI", "MII Deck"]));
  });

  it("keeps the public MII Microsoft app names out of it, which would make Microsoft look like a known employer", () => {
    expect(loadAllowlist().filter((name) => /mii-microsoft/i.test(name))).toEqual([]);
  });
});

describe("findTerms", () => {
  it("matches whole words case-insensitively", () => {
    expect(findTerms("Built the codenamex platform", ["CodenameX"])).toEqual(["CodenameX"]);
    expect(findTerms("codenamexyz", ["CodenameX"])).toEqual([]);
  });

  it("treats /regex/ terms as case-sensitive regex", () => {
    expect(findTerms("zeta label", ["/\\bZETA\\b/"])).toEqual([]);
    expect(findTerms("the ZETA agent", ["/\\bZETA\\b/"])).toEqual(["/\\bZETA\\b/"]);
  });
});

describe("scanBuildOutput", () => {
  const terms = ["Fingerprint Phrase", "/\\bQZX\\b/"];

  it("reports every text file of the export that holds a term, scripts and styles included, and skips binaries", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hq-out-"));
    try {
      mkdirSync(path.join(dir, "en", "labs"), { recursive: true });
      writeFileSync(path.join(dir, "en", "labs", "x.html"), "<p>A fingerprint phrase</p>");
      writeFileSync(path.join(dir, "en", "labs.txt"), "nothing here");
      for (const ext of ["js", "css", "svg", "md"]) writeFileSync(path.join(dir, `chunk.${ext}`), `const pill = "Fingerprint Phrase";`);
      writeFileSync(path.join(dir, "photo.webp"), "Fingerprint Phrase");
      const hits = scanBuildOutput(dir, terms);
      expect(hits.map((h) => h.file).sort()).toEqual(["chunk.css", "chunk.js", "chunk.md", "chunk.svg", path.join("en", "labs", "x.html")].sort());
      expect(hits.every((h) => h.terms.join() === "Fingerprint Phrase")).toBe(true);
      expect(scanBuildOutput(dir, terms, (found) => found.map(() => "hidden"))[0]?.terms).toEqual(["hidden"]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("maskBuildTokens (machine-made tokens never match a term)", () => {
  const QZX = "/\\b[Qq][Zz][Xx]/";
  const terms = [QZX, "Zurichy"];
  const id = "Zvts-QZX-Y1PG-LQ0qNlIp";

  it("ignores a CSP or SRI hash, a data URI, the build id and chunk or media hashes that spell a term", () => {
    const tokens = [
      `<meta data-hq-csp content="script-src 'self' 'sha256-ugRkGroIxkNMt5injvZXW+QZX/AxayFN5fnJYRyoT/gQ='">`,
      `<link integrity="sha384-ab+QZX+cdEfGhIjKlMnOpQrStUvWxYz0123456789ab+/cdEfGhIjKlMnOpQrStUv">`,
      `<img src="data:image/png;base64,iVBORw0+Zurichy/+QZX+AAAA==">`,
      `self.__next_f.push([1,"0:{\\"P\\":null,\\"b\\":\\"${id}\\"}"])`,
      `<script src="/_next/static/${id}/_buildManifest.js"></script>`,
      `<script src="/_next/static/chunks/qzx42u14tx9.js"></script>`,
      `@font-face{src:url(../media/inter_latin1-s.p.qzx3bn23z.woff2)}`,
    ];
    expect(tokens.map((t) => findTerms(t, terms))).toEqual([[QZX], [QZX], [QZX, "Zurichy"], [QZX], [QZX], [QZX], [QZX]]);
    for (const t of tokens) expect(findTerms(maskBuildTokens(t, [id]), terms), t).toEqual([]);
  });

  it("still flags real occurrences next to tokens, in readable asset names and in prose", () => {
    const real = [
      `<p>Built for QZX</p><meta content="'sha256-ugRkGroIxkNMt5injvZXWBNAx++ayFN5fnJYRyoT/gQ='">`,
      `self.__next_f.push([1,"{\\"client\\":\\"Zurichy\\",\\"b\\":\\"${id}\\"}"])`,
      `<img src="/_next/static/media/zurichy-logo.4f2a9c1b7d3e.png">`,
      `<img src="/_next/static/media/zurichy-logo.png">`,
      `<script src="/_next/static/chunks/zurichy.js"></script>`,
      `Our sha256-checked build for Zurichy`,
    ];
    expect(real.map((t) => findTerms(maskBuildTokens(t, [id]), terms))).toEqual([[QZX], ["Zurichy"], ["Zurichy"], ["Zurichy"], ["Zurichy"], ["Zurichy"]]);
  });

  it("finds the build id directories of an export and masks them in scanBuildOutput", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hq-out-"));
    try {
      for (const d of [id, "chunks", "media"]) mkdirSync(path.join(dir, "_next", "static", d), { recursive: true });
      expect(exportBuildIds(dir)).toEqual([id]);
      writeFileSync(path.join(dir, "page.html"), `<script src="/_next/static/${id}/_ssgManifest.js"></script><meta content="'sha256-x+QZX/abcdefghijklmnopqrstuvwxyz0123456789='">`);
      writeFileSync(path.join(dir, "leak.html"), `<script src="/_next/static/${id}/_ssgManifest.js"></script><p>Zurichy</p>`);
      expect(scanBuildOutput(dir, terms)).toEqual([{ file: "leak.html", terms: ["Zurichy"] }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("findForbiddenPatterns", () => {
  it.each([
    ["an em dash \u2014 here", "em dash"],
    ["saved Rp 5 juta", "money amount"],
    ["call +62 812 3456 7890", "phone number"],
    ["https://foo.azurewebsites.net", "Azure resource hostname"],
    ["my Master's thesis", "Master's degree"],
  ])("flags %s", (text, name) => {
    expect(findForbiddenPatterns(text)).toContain(name);
  });

  it("allows ordinary copy", () => {
    expect(findForbiddenPatterns("Interruption latency ~2 s to ~0.2 s (controlled A/B, n=4)")).toEqual([]);
  });
});

describe("collectStrings", () => {
  it("returns every string with its path", () => {
    expect(collectStrings({ a: ["x", { b: "y" }], n: 1 })).toEqual([
      { path: "$.a[0]", value: "x" },
      { path: "$.a[1].b", value: "y" },
    ]);
  });
});

describe("leafForbiddenPatterns (public live links, R4-J)", () => {
  it("exempts a pod liveUrl on an allowlisted host from the Azure hostname rule", () => {
    expect(leafForbiddenPatterns({ path: "$.floors.labs.pods[3].liveUrl", value: "https://mii-microsoft.azurewebsites.net" })).toEqual([]);
    expect(leafForbiddenPatterns({ path: "$[0].liveUrl", value: "https://mii-microsoft-ai.azurewebsites.net" })).toEqual([]);
  });

  it("still flags other Azure hosts in liveUrl and allowlisted hosts in any other field", () => {
    expect(leafForbiddenPatterns({ path: "$.floors.labs.pods[3].liveUrl", value: "https://vendor-portal.azurewebsites.net" })).toContain("Azure resource hostname");
    expect(leafForbiddenPatterns({ path: "$.floors.labs.pods[3].liveUrl", value: "https://mii-microsoft-ai.azurewebsites.net/dashboard" })).toContain(
      "Azure resource hostname",
    );
    expect(leafForbiddenPatterns({ path: "$.floors.labs.pods[3].tagline.en", value: "See https://mii-microsoft.azurewebsites.net" })).toContain(
      "Azure resource hostname",
    );
  });
});
