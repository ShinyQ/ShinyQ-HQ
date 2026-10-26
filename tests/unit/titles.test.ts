import { describe, expect, it } from "vitest";
import { applyTitleCase, frontmatterTitle, titleCaseChanges, titleSlots, withFrontmatterTitle } from "@/content/titles";
import { makeContent, makePod } from "../fixtures/minimal-content";

describe("title slots", () => {
  const content = () => {
    const c = makeContent();
    c.floors.labs.pods = [makePod({ slug: "voice", title: { en: "Realtime voice AI contact center", id: "Contact center voice AI realtime" } })];
    c.floors.library.publications = [{ id: "model", title: "IndoBERT app-review sentiment model", year: 2023, kind: "model" }];
    c.sideProjects = [{ id: "crypto", title: "Crypto portfolio tracker", summary: { en: "Tracks coins", id: "Melacak koin" }, stack: [] }];
    return c;
  };

  it("lists localized and plain title fields with readable paths", () => {
    const paths = titleSlots(content()).map((s) => s.path);
    expect(paths).toContain("floors.labs.pods[0](voice).title.en");
    expect(paths).toContain("floors.labs.pods[0](voice).title.id");
    expect(paths).toContain("floors.library.publications[0](model).title");
    expect(paths).toContain("floors.library.tracks[0](writing).title.id");
    expect(paths).toContain("sideProjects[0](crypto).title");
    expect(paths).toContain("profile.principles[0](spec-first).title.en");
  });

  it("reports and applies Title Case without touching other fields", () => {
    const c = content();
    expect(titleCaseChanges(c)).toContainEqual({ path: "floors.labs.pods[0](voice).title.en", before: "Realtime voice AI contact center", after: "Realtime Voice AI Contact Center" });
    const changes = applyTitleCase(c);
    expect(changes.length).toBeGreaterThan(0);
    expect(c.floors.labs.pods[0].title).toEqual({ en: "Realtime Voice AI Contact Center", id: "Contact Center Voice AI Realtime" });
    expect(c.floors.labs.pods[0].tagline).toEqual(makePod().tagline);
    expect(c.floors.library.publications[0].title).toBe("IndoBERT App-Review Sentiment Model");
    expect(c.sideProjects[0].title).toBe("Crypto Portfolio Tracker");
    expect(c.profile.principles[0].title.en).toBe("Spec First");
    expect(titleCaseChanges(c)).toEqual([]);
  });
});

describe("MDX frontmatter titles", () => {
  const source = '---\ntitle: "How we made a voice agent interruptible"\ndate: "2026-10-09"\n---\n\nBody with title: "not this".\n';

  it("reads and replaces only the frontmatter title", () => {
    expect(frontmatterTitle(source)).toBe("How we made a voice agent interruptible");
    const next = withFrontmatterTitle(source, "How We Made a Voice Agent Interruptible");
    expect(frontmatterTitle(next)).toBe("How We Made a Voice Agent Interruptible");
    expect(next).toBe(source.replace('title: "How we made a voice agent interruptible"', 'title: "How We Made a Voice Agent Interruptible"'));
  });

  it("returns undefined without a frontmatter title", () => {
    expect(frontmatterTitle('---\ndate: "2026-10-09"\n---\nBody')).toBeUndefined();
    expect(frontmatterTitle('Body\ntitle: "Not frontmatter"\n')).toBeUndefined();
  });
});
