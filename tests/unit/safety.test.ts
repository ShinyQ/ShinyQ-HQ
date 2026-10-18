import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectStrings,
  exportBuildIds,
  findBlockedTerms,
  findForbiddenPatterns,
  leafForbiddenPatterns,
  isAllowedTerm,
  loadAllowlist,
  loadBlocklist,
  maskBuildTokens,
  parseBlocklist,
  scanBuildOutput,
} from "@/content/safety";

describe("parseBlocklist", () => {
  it("supports comments, lines and commas", () => {
    expect(parseBlocklist("# c\nfoo, bar\n\n/baz/ # trailing")).toEqual(["foo", "bar", "/baz/"]);
  });
});

describe("loadBlocklist", () => {
  it("merges the SAFETY_BLOCKLIST env var", () => {
    expect(loadBlocklist({ SAFETY_BLOCKLIST: "SecretCodename,Other" })).toEqual(
      expect.arrayContaining(["SecretCodename", "Other"]),
    );
  });
});

describe("product allowlist (C3, revised 2026-10-10)", () => {
  it("drops allowed product names from every source, including the private list", () => {
    const terms = loadBlocklist({ SAFETY_BLOCKLIST: "aria, Pris.AI, /\\bFREDDY\\b/, private-repo" });
    expect(terms).toContain("private-repo");
    expect(terms).not.toEqual(expect.arrayContaining(["aria"]));
    expect(terms).not.toContain("Pris.AI");
    expect(terms).not.toContain("/\\bFREDDY\\b/");
  });

  it("never drops a broad regex or a client name", () => {
    expect(isAllowedTerm("/[Ss]alary/", ["ATLAS"])).toBe(false);
    expect(isAllowedTerm("Sari Roti", loadAllowlist())).toBe(false);
  });

  it("lists no client company name", () => {
    const blocked = loadBlocklist({}, []);
    expect(loadAllowlist().filter((name) => findBlockedTerms(name, blocked).length > 0)).toEqual([]);
  });
});

describe("client company names (C3, revised 2026-10-10)", () => {
  const terms = loadBlocklist({});

  it.each([
    "Built for SMBC Indonesia",
    "a PoC at SMBCI",
    "Bank SMBC evaluators",
    "Mitsubishi Motors (MMKSI)",
    "Sari Roti planners",
    "Turangga Resources finance",
    "the TTA group",
  ])("flags %s", (text) => {
    expect(findBlockedTerms(text, terms)).not.toHaveLength(0);
  });

  it("allows the employer label and sector labels", () => {
    expect(findBlockedTerms("Software Engineer at Jenius (SMBC Indonesia)", terms)).toEqual([]);
    expect(findBlockedTerms("A national digital bank, an automotive manufacturer, a national bakery brand", terms)).toEqual([]);
  });
});

describe("scanBuildOutput", () => {
  it("reports every text file of the export that names a client, scripts and styles included (S9), and skips binaries", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hq-out-"));
    try {
      mkdirSync(path.join(dir, "en", "labs"), { recursive: true });
      writeFileSync(path.join(dir, "en", "labs", "x.html"), "<p>Client: Sari Roti</p>");
      writeFileSync(path.join(dir, "en", "labs.txt"), "Jenius (SMBC Indonesia)");
      for (const ext of ["js", "css", "svg", "md"]) writeFileSync(path.join(dir, `chunk.${ext}`), `const pill = "Sari Roti";`);
      writeFileSync(path.join(dir, "photo.webp"), "Sari Roti");
      const hits = scanBuildOutput(dir, loadBlocklist({}));
      expect(hits.map((h) => h.file).sort()).toEqual(["chunk.css", "chunk.js", "chunk.md", "chunk.svg", path.join("en", "labs", "x.html")].sort());
      expect(hits.every((h) => h.terms.join() === "Sari Roti")).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("maskBuildTokens (machine-made tokens never match the blocklist)", () => {
  const terms = loadBlocklist({});
  const SMBC = "/(?<!Jenius \\()\\b[Ss][Mm][Bb][Cc]/";
  const id = "Zvts-SMBCY1PG-LQ0qNlIp";

  it("ignores a CSP or SRI hash, a data URI, the build id and chunk or media hashes that spell a term", () => {
    const tokens = [
      `<meta data-hq-csp content="script-src 'self' 'sha256-ugRkGroIxkNMt5injvZXW+SmBc/AxayFN5fnJYRyoT/gQ='">`,
      `<link integrity="sha384-ab+NIK+cdEfGhIjKlMnOpQrStUvWxYz0123456789ab+/cdEfGhIjKlMnOpQrStUv">`,
      `<img src="data:image/png;base64,iVBORw0+Zurich/+TTA+AAAA==">`,
      `self.__next_f.push([1,"0:{\\"P\\":null,\\"b\\":\\"${id}\\"}"])`,
      `<script src="/_next/static/${id}/_buildManifest.js"></script>`,
      `<script src="/_next/static/chunks/smbc42u14tx9.js"></script>`,
      `@font-face{src:url(../media/inter_latin1-s.p.smbcbnw3bn23.woff2)}`,
    ];
    expect(tokens.map((t) => findBlockedTerms(t, terms))).toEqual([[SMBC], ["/\\bNIK\\b/"], ["/\\bTTA\\b/", "Zurich"], [SMBC], [SMBC], [SMBC], [SMBC]]);
    for (const t of tokens) expect(findBlockedTerms(maskBuildTokens(t, [id]), terms), t).toEqual([]);
  });

  it("still flags real occurrences next to tokens, in readable asset names and in prose", () => {
    const real = [
      `<p>Built for SMBC</p><meta content="'sha256-ugRkGroIxkNMt5injvZXWBNAx++ayFN5fnJYRyoT/gQ='">`,
      `self.__next_f.push([1,"{\\"client\\":\\"Sari Roti\\",\\"b\\":\\"${id}\\"}"])`,
      `<img src="/_next/static/media/mitsubishi-logo.4f2a9c1b7d3e.png">`,
      `<img src="/_next/static/media/mitsubishi-logo.png">`,
      `<script src="/_next/static/chunks/mitsubishi.js"></script>`,
      `Our sha256-checked build for Zurich`,
    ];
    expect(real.map((t) => findBlockedTerms(maskBuildTokens(t, [id]), terms))).toEqual([[SMBC], ["Sari Roti"], ["Mitsubishi"], ["Mitsubishi"], ["Mitsubishi"], ["Zurich"]]);
    expect(findBlockedTerms(maskBuildTokens("Jenius (SMBC Indonesia)", [id]), terms)).toEqual([]);
  });

  it("finds the build id directories of an export and masks them in scanBuildOutput", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hq-out-"));
    try {
      for (const d of [id, "chunks", "media"]) mkdirSync(path.join(dir, "_next", "static", d), { recursive: true });
      expect(exportBuildIds(dir)).toEqual([id]);
      writeFileSync(path.join(dir, "page.html"), `<script src="/_next/static/${id}/_ssgManifest.js"></script><meta content="'sha256-x+SMBC/abcdefghijklmnopqrstuvwxyz0123456789='">`);
      writeFileSync(path.join(dir, "leak.html"), `<script src="/_next/static/${id}/_ssgManifest.js"></script><p>Mitsubishi</p>`);
      expect(scanBuildOutput(dir, terms)).toEqual([{ file: "leak.html", terms: ["Mitsubishi"] }]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("findBlockedTerms", () => {
  it("matches whole words case-insensitively", () => {
    expect(findBlockedTerms("Built the codenamex platform", ["CodenameX"])).toEqual(["CodenameX"]);
    expect(findBlockedTerms("codenamexyz", ["CodenameX"])).toEqual([]);
  });

  it("treats /regex/ terms as case-sensitive regex", () => {
    expect(findBlockedTerms("zeta label", ["/\\bZETA\\b/"])).toEqual([]);
    expect(findBlockedTerms("the ZETA agent", ["/\\bZETA\\b/"])).toEqual(["/\\bZETA\\b/"]);
  });

  it("flags personal-data terms from the committed default list", () => {
    expect(findBlockedTerms("my NIK is on file", loadBlocklist({}))).not.toHaveLength(0);
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

describe("public MII Microsoft app names (R4-J)", () => {
  it("drops the two public app names from the merged blocklist but keeps other private resource names", () => {
    const terms = loadBlocklist({ SAFETY_BLOCKLIST: "mii-microsoft, mii-microsoft-ai, example-internal-api" });
    expect(terms).toContain("example-internal-api");
    expect(terms).not.toContain("mii-microsoft");
    expect(terms).not.toContain("mii-microsoft-ai");
    expect(findBlockedTerms("https://mii-microsoft-ai.azurewebsites.net", terms)).toEqual([]);
  });

  it("keeps them out of the product allowlist, which feeds the Ask employer check", () => {
    expect(loadAllowlist().filter((name) => /mii-microsoft/i.test(name))).toEqual([]);
  });
});
