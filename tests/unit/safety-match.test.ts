import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { findBlockedTerms as fromSafety } from "@/content/safety";
import { findBlockedTerms } from "@/content/safety-match";

describe("safety-match", () => {
  it("matches whole words case-insensitively and /regex/ terms case-sensitively", () => {
    expect(findBlockedTerms("Shipped for Acme Corp today", ["acme corp", "/^Shipped/", "/^shipped/"])).toEqual(["acme corp", "/^Shipped/"]);
    expect(findBlockedTerms("acmecorp", ["acme"])).toEqual([]);
  });

  it("is the function safety.ts exports", () => {
    expect(fromSafety).toBe(findBlockedTerms);
  });

  it("imports no Node module (the hq-office Worker bundles it)", () => {
    expect(readFileSync("src/content/safety-match.ts", "utf8")).not.toMatch(/from "node:|require\(/);
  });
});
