import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { askLinkTarget, ASK_SITE_ORIGINS } from "@/ask/links";
import { TURNSTILE_DOMAINS } from "../../scripts/provision-ask";

// Main address (owner decision 2026-11-02, docs/deploy.md section 7b). kurniadi.my.id is not the owner's domain.
const MAIN = "shinyq.my.id";
const HOSTS = ["kurniadi.pages.dev", MAIN, "kurniadi.dev"];

function tomlVar(file: string, name: string): string[] {
  const value = new RegExp(`^${name} = "([^"]*)"$`, "m").exec(readFileSync(file, "utf8"))?.[1];
  if (value === undefined) throw new Error(`${file} has no ${name}`);
  return value.split(",").map((v) => v.trim());
}

describe("production host lists", () => {
  it("accept the main address next to kurniadi.pages.dev and kurniadi.dev", () => {
    expect(tomlVar("wrangler.toml", "ASK_ALLOWED_ORIGINS")).toEqual(HOSTS.map((h) => `https://${h}`));
    expect(tomlVar("workers/stats/wrangler.toml", "WA_HOSTS")).toEqual(HOSTS);
    expect(TURNSTILE_DOMAINS).toEqual(HOSTS);
    expect(ASK_SITE_ORIGINS).toEqual(expect.arrayContaining([`https://${MAIN}`, "https://kurniadi.pages.dev"]));
  });

  it("keeps Ask links to the main address as site paths", () => {
    expect(askLinkTarget(`https://${MAIN}/en/labs`)).toEqual({ kind: "site", path: "/labs" });
  });

  it("never name kurniadi.my.id", () => {
    for (const file of ["wrangler.toml", "workers/stats/wrangler.toml", "workers/stats/README.md", "scripts/provision-ask.ts", "src/ask/links.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toContain("kurniadi.my.id");
    }
  });
});
