import { describe, expect, it } from "vitest";
import { collectStrings, findBlockedTerms, findForbiddenPatterns, loadBlocklist, parseBlocklist } from "@/content/safety";

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
