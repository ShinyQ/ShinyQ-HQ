import { describe, expect, it } from "vitest";
import { getSecurity, securityIssues } from "@/content/security";
import { titleCase } from "@/content/title-case";
import { hasFirstPerson } from "@/lib/first-person";
import { LOCALES } from "@/content/locales";

describe("security page content (content/security.json, owner decision 2026-11-13)", () => {
  const page = getSecurity();

  it("names only case studies and awards the dataset has", () => {
    expect(securityIssues(page)).toEqual([]);
  });

  it("keeps the page title in Title Case and free of the first person", () => {
    for (const locale of LOCALES) {
      expect(hasFirstPerson(page.title[locale], locale), page.title[locale]).toBe(false);
      expect(titleCase(page.title[locale])).toBe(page.title[locale]);
    }
  });

  it("leads with impact: the first proof result and every AI result is a before and after", () => {
    expect(page.proof[0].delta).toBeDefined();
    for (const result of page.ai.results) expect(result.delta, result.id).toBeDefined();
  });
});
