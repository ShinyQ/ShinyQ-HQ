import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES } from "@/content/locales";
import { LocaleSchema } from "@/content/schema";

describe("locales", () => {
  it("match the schema enum", () => {
    expect(LocaleSchema.options).toEqual([...LOCALES]);
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });

  it("stay import-free so client modules never pull zod", () => {
    const source = readFileSync(path.join(process.cwd(), "src/content/locales.ts"), "utf8");
    expect(source).not.toMatch(/^\s*import\s/m);
  });

  it("is what client modules import", () => {
    for (const file of ["src/hud/Controls.tsx", "src/components/LocaleSwitch.tsx", "src/lib/url-sync.ts", "src/i18n/routing.ts"]) {
      const source = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source, file).not.toMatch(/import \{[^}]*\b(LOCALES|DEFAULT_LOCALE)\b[^}]*\} from "@\/content\/schema"/);
    }
  });
});
