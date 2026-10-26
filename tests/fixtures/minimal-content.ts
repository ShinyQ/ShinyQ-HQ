import type { Pod, SiteContent, TimelineEntry } from "@/content/schema";

const lt = (en: string, id = `${en} (id)`) => ({ en, id });

export function makePod(overrides: Partial<Pod> = {}): Pod {
  return {
    id: "sample-pod",
    slug: "sample-pod",
    order: 0,
    tier: "featured",
    accent: "violet",
    wing: "ai",
    title: lt("Sample pod"),
    tagline: lt("A tagline"),
    period: { start: "2026-01", end: "present" },
    role: lt("Lead engineer"),
    problem: lt("A problem"),
    approach: [lt("Step one"), lt("Step two")],
    results: [{ value: "2x", label: lt("Faster"), context: lt("Offline evaluation"), confidence: "verified" }],
    stack: ["Python"],
    hologram: "graph",
    assets: [],
    ...overrides,
  };
}

export function makeEntry(overrides: Partial<TimelineEntry> = {}): TimelineEntry {
  return {
    id: "sample-entry",
    slug: "sample-entry",
    type: "job",
    org: "Example Org",
    role: lt("Engineer"),
    start: "2024-06",
    end: "2025-12",
    summary: lt("Summary"),
    highlights: [],
    stack: [],
    discipline: "software",
    ...overrides,
  };
}

export function makeContent(): SiteContent {
  return {
    profile: {
      name: "Test Person",
      handle: "test",
      headline: lt("Forward Deployed AI Engineer"),
      subheadline: lt("Builds things"),
      currentRole: { title: lt("Consultant"), org: "Example", since: "2026-02" },
      location: lt("Jakarta"),
      timezone: "GMT+7",
      bio: lt("Bio"),
      story: lt("Story"),
      howIWork: lt("How"),
      principles: [{ id: "spec-first", title: lt("Spec first"), text: lt("Specs") }],
      heroProof: ["a", "b", "c"],
    },
    production: {
      title: lt("How I run AI in production"),
      intro: lt("Intro"),
      points: [
        { id: "one", lead: lt("One."), text: lt("Text one") },
        { id: "two", lead: lt("Two."), text: lt("Text two") },
      ],
      outro: lt("Outro"),
      tiles: (["metrics", "traces", "alerts"] as const).map((panel) => ({ id: panel, label: lt(panel), value: lt("1"), detail: lt("detail"), panel })),
      alerts: [lt("Spend")],
      caseStudies: ["sample-pod"],
    },
    stats: ["a", "b", "c", "d"].map((id) => ({ id, value: "1", label: lt(id), short: lt(id), source: "test", confidence: "verified" as const })),
    skills: [{ id: "backend", label: lt("Backend"), items: ["Go"] }],
    certifications: [],
    awards: [],
    floors: {
      careerArchive: { entries: [makeEntry()] },
      labs: { pods: [makePod()] },
      library: { tracks: [{ slug: "writing", title: lt("Writing") }], posts: [], publications: [], talks: [] },
      roof: {
        contact: { email: "a@example.com", linkedin: "https://linkedin.com/in/x", github: "https://github.com/x" },
        availability: lt("Open"),
        cv: { fileName: "test-cv" },
      },
    },
    sideProjects: [],
    publicRepos: [],
    missions: [{ id: "hire", order: 0, label: lt("Hire"), steps: [{ kind: "elevator", floor: "RF" }] }],
  };
}
