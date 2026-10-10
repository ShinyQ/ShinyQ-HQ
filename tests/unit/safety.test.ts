import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectStrings,
  findBlockedTerms,
  findForbiddenPatterns,
  isAllowedTerm,
  loadAllowlist,
  loadBlocklist,
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
  it("reports text files of the export that name a client, and skips scripts", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "hq-out-"));
    try {
      mkdirSync(path.join(dir, "en", "labs"), { recursive: true });
      writeFileSync(path.join(dir, "en", "labs", "x.html"), "<p>Client: Sari Roti</p>");
      writeFileSync(path.join(dir, "en", "labs.txt"), "Jenius (SMBC Indonesia)");
      writeFileSync(path.join(dir, "chunk.js"), "Sari Roti");
      expect(scanBuildOutput(dir, loadBlocklist({}))).toEqual([{ file: path.join("en", "labs", "x.html"), terms: ["Sari Roti"] }]);
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
