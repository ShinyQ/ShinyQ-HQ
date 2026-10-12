import { describe, expect, it } from "vitest";
import { CONCEPT_BUILDERS } from "@/experience/floors/library/concepts";
import { LIBRARY_CONCEPTS, LIBRARY_FLOOR, libraryLayoutInput } from "@/experience/floors/library/model";
import { filterStops } from "@/experience/missions/walk";
import { libraryWalk, type LibraryWalkLabels } from "@/experience/missions/walks";
import type { LibraryData } from "@/experience/types";

const post = (slug: string, date: string, extra: Partial<LibraryData["posts"][number]> = {}): LibraryData["posts"][number] => ({
  slug,
  title: `Title ${slug}`,
  date,
  languages: ["en", "id"],
  tags: ["ai"],
  url: null,
  ...extra,
});

const LIBRARY: LibraryData = {
  posts: [post("new", "2026-10-01"), post("medium", "2022-02-28", { url: "https://medium.com/x", languages: ["id"] }), post("old", "2020-12-31", { languages: ["id"] })],
  research: [{ id: "paper", title: "Paper", kind: "paper", year: 2021, publisher: "IEEE" }],
  researchMetrics: null,
  models: [{ id: "model", title: "Model", kind: "model", venue: "Hugging Face", year: 2024 }],
  talks: [{ id: "talk", title: "Talk", event: "Event", date: "2024-01", role: "speaker" }],
};

const LABELS: LibraryWalkLabels = {
  zones: { blog: "Blog", research: "Research", models: "Models and datasets", talks: "Talks and workshops" },
  onMedium: "On Medium",
  more: "More writing here",
  moreSub: "Open lists every post",
};

describe.each(LIBRARY_CONCEPTS)("Read my writing on the %s concept", (concept) => {
  const layout = CONCEPT_BUILDERS[concept](libraryLayoutInput(LIBRARY));

  it("visits every station in the layout order with titles from content", () => {
    const walk = libraryWalk(LIBRARY, LABELS, layout);
    expect(walk).toMatchObject({ id: "writing", floor: "L4" });
    expect(walk.stops.map((s) => s.id)).toEqual(layout.stations.map((s) => s.room));
    expect(walk.stops.find((s) => s.id === "L4:new")).toMatchObject({ title: "Title new", subtitle: "2026 · EN/ID", group: "Blog", room: "L4:new", tags: ["blog"] });
    expect(walk.stops.find((s) => s.id === "L4:medium")?.subtitle).toBe("2022 · On Medium");
    expect(walk.stops.find((s) => s.id === "L4:research")).toMatchObject({ title: "Research", group: "Research", tags: ["research"] });
    expect(walk.stops.at(-1)?.id).toBe("L4:talks");
  });

  it("filters by zone and lists only zones with a stop", () => {
    const walk = libraryWalk(LIBRARY, LABELS, layout);
    expect(walk.filters?.map((f) => f.id)).toEqual(["blog", "research", "models", "talks"]);
    expect(filterStops(walk.stops, "models").map((s) => s.id)).toEqual(["L4:publications"]);
    const postsOnly: LibraryData = { ...LIBRARY, research: [], models: [], talks: [] };
    const onlyBlog = libraryWalk(postsOnly, LABELS, CONCEPT_BUILDERS[concept](libraryLayoutInput(postsOnly)));
    expect(onlyBlog.filters?.map((f) => f.id)).toEqual(["blog"]);
  });

  it("ends at the archive board when older posts do not fit on the floor", () => {
    const many: LibraryData = { ...LIBRARY, posts: Array.from({ length: LIBRARY_FLOOR.maxPosts + 2 }, (_, i) => post(`p${i}`, `20${String(26 - i).padStart(2, "0")}-01-01`)) };
    const crowded = CONCEPT_BUILDERS[concept](libraryLayoutInput(many));
    const walk = libraryWalk(many, LABELS, crowded);
    expect(walk.stops.at(-1)).toMatchObject({ id: "L4:archive", palette: "posts", to: crowded.board!.stop, tags: ["blog"] });
    expect(walk.stops.at(-1)?.room).toBeUndefined();
  });
});
