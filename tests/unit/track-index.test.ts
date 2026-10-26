import { describe, expect, it } from "vitest";
import { buildTrackIndex } from "@/content/track-index";

const t = (slug: string, lead?: string) => ({ slug, title: { en: slug, id: slug }, ...(lead ? { lead } : {}) });
const p = (slug: string, date: string, track: string) => ({ slug, date, track });

describe("buildTrackIndex", () => {
  it("keeps dataset order, puts the lead first, then newest first", () => {
    const index = buildTrackIndex({
      tracks: [t("b", "b-old"), t("a")],
      posts: [p("a-new", "2026-10-02", "a"), p("b-old", "2025-01-01", "b"), p("b-new", "2026-10-01", "b"), p("a-old", "2024-01-01", "a")],
    });
    expect(index).toEqual([
      { slug: "b", posts: ["b-old", "b-new"] },
      { slug: "a", posts: ["a-new", "a-old"] },
    ]);
  });
  it("falls back to the newest post without a lead and keeps empty tracks", () => {
    expect(buildTrackIndex({ tracks: [t("a"), t("e")], posts: [p("x", "2026-01-01", "a"), p("y", "2026-02-01", "a")] })).toEqual([
      { slug: "a", posts: ["y", "x"] },
      { slug: "e", posts: [] },
    ]);
  });
  it("is stable for posts on the same date (slug order)", () => {
    const index = buildTrackIndex({ tracks: [t("a")], posts: [p("b", "2026-10-09", "a"), p("a", "2026-10-09", "a")] });
    expect(index[0].posts).toEqual(["a", "b"]);
  });
});
