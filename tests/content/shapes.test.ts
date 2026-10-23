import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { buildLibraryData } from "@/content/experience-floors";
import { careerIcons } from "@/experience/floors/career/icons";
import { buildCareerRoad, careerLayoutInput } from "@/experience/floors/career/layout";
import { DESK, libraryIcons } from "@/experience/floors/library/icons";
import { CAREER_ICONS, LIBRARY_ICONS } from "@/experience/fx/holoIcons";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import { getContent } from "@/content/load";
import { hologramIdClashes, type SiteContent } from "@/content/schema";
import { getSculptures, iconStrokes, SCULPTURE_SCALE, SHAPE_FLOORS, shapeFile, shapeFiles, shapeIssues, shapePayloads, shapeUrl } from "@/content/shapes";
import { writeShapes } from "../../scripts/build-shapes";

const clone = (): SiteContent => structuredClone(getContent());
const UNIQUE_TYPES = new Set(["job", "education", "freelance"]);
// Shape words (bank, ticket) are fine; organisation names are not (C3 for clients, and ids stay generic for the rest).
const FORBIDDEN_IN_IDS = /jenius|metrodata|smbc|bssn|temmpat|serupa|jublia|naremax|shumi|dariordal|kalbe|telkom|digitiket|techbros|jatis|mnc|mii/;

describe("hologram ids in the content", () => {
  it("names an icon on every career entry, post, publication and talk, and a sculpture on every pod", () => {
    const { careerArchive, labs, library } = getContent().floors;
    for (const e of careerArchive.entries) expect(e.icon, e.slug).toBeTruthy();
    for (const p of labs.pods) expect(p.sculpture, p.slug).toBeTruthy();
    for (const p of library.posts) expect(p.icon, p.slug).toBeTruthy();
    for (const p of library.publications) expect(p.icon, p.id).toBeTruthy();
    for (const t of library.talks) expect(t.icon, t.id).toBeTruthy();
  });

  it("resolves every id (vendored icon, sculpture recipe) with few shared career variants", () => {
    expect(shapeIssues(getContent())).toEqual([]);
  });

  it("keeps the required ids unique and generic (no client or employer name)", () => {
    const { careerArchive, labs, library } = getContent().floors;
    const career = careerArchive.entries.filter((e) => UNIQUE_TYPES.has(e.type)).map((e) => e.icon);
    expect(new Set(career).size).toBe(career.length);
    expect(new Set(labs.pods.map((p) => p.sculpture)).size).toBe(labs.pods.length);
    const l4 = [...library.posts, ...library.publications, ...library.talks].map((i) => i.icon);
    expect(new Set(l4).size).toBe(l4.length);
    for (const id of [...careerArchive.entries.map((e) => e.icon), ...labs.pods.map((p) => p.sculpture), ...l4]) expect(id).not.toMatch(FORBIDDEN_IN_IDS);
  });

  it("reports duplicates through the schema and unknown ids through shapeIssues", () => {
    const content = clone();
    const jobs = content.floors.careerArchive.entries.filter((e) => e.type === "job");
    jobs[1].icon = jobs[0].icon;
    content.floors.labs.pods[1].sculpture = content.floors.labs.pods[0].sculpture;
    content.floors.library.talks[0].icon = content.floors.library.posts[0].icon;
    const clashes = hologramIdClashes(content).map((c) => c.message);
    expect(clashes).toHaveLength(3);
    expect(clashes[0]).toMatch(/Career icon/);

    const broken = clone();
    broken.floors.library.posts[0].icon = "no-such-icon";
    broken.floors.labs.pods[0].sculpture = "no-such-sculpture";
    const milestones = broken.floors.careerArchive.entries.filter((e) => e.type === "milestone");
    ["ticket", "plane", "server", "layers", "landmark"].forEach((id, i) => (milestones[i].icon = id));
    const issues = shapeIssues(broken);
    expect(issues.some((i) => i.includes('"no-such-icon"'))).toBe(true);
    expect(issues.some((i) => i.includes('"no-such-sculpture"'))).toBe(true);
    expect(issues.some((i) => i.startsWith("milestone icons"))).toBe(true);
  });
});

describe("shape payloads", () => {
  it("places an icon for every L2 entry, keys L3 by pod slug and places every docked L4 item", () => {
    const content = getContent();
    const payloads = shapePayloads(content);
    const { careerArchive, labs } = content.floors;
    expect(payloads.L2.icons!.map((i) => i.key).sort()).toEqual(careerArchive.entries.map((e) => e.slug).sort());
    expect(Object.keys(payloads.L3.items!).sort()).toEqual(labs.pods.map((p) => p.slug).sort());
    const graduation = payloads.L2.icons!.find(({ key }) => key.startsWith("graduation-") && key.endsWith("2023"));
    expect(graduation!.strokes).toEqual(iconStrokes("graduation-cap"));
    for (const parts of Object.values(payloads.L3.items!)) expect(parts.length).toBeGreaterThan(0);
    // Sculptures ship scaled to the floor (a fifth above the kind holograms).
    const first = content.floors.labs.pods[0];
    expect(payloads.L3.items![first.slug][0].w).toBeCloseTo(getSculptures()[first.sculpture!][0].w * SCULPTURE_SCALE, 3);
  });

  it("keeps the fallback shape for items without an id", () => {
    const content = clone();
    delete content.floors.library.talks[0].icon;
    delete content.floors.labs.pods[0].sculpture;
    const job = content.floors.careerArchive.entries.find((e) => e.type === "job")!;
    delete job.icon;
    const payloads = shapePayloads(content);
    expect(payloads.L4.icons!.find((i) => i.key === content.floors.library.talks[0].id)!.strokes).toEqual(LIBRARY_ICONS.talks);
    expect(payloads.L2.icons!.find((i) => i.key === job.slug)!.strokes).toEqual(CAREER_ICONS.job);
    expect(payloads.L3.items![content.floors.labs.pods[0].slug]).toBeUndefined();
  });

  it("names each file by a hash of its JSON and hands the same URL to the experience data", () => {
    const files = shapeFiles();
    for (const floor of SHAPE_FLOORS) {
      expect(files[floor].name).toMatch(new RegExp(`^${floor}\\.[0-9a-f]{10}\\.json$`));
      expect(JSON.parse(files[floor].json).floor).toBe(floor);
      expect(shapeUrl(floor)).toBe(`/shapes/${files[floor].name}`);
    }
    const payload = shapePayloads().L2;
    expect(shapeFile(payload).name).toBe(files.L2.name);
    expect(shapeFile({ ...payload, icons: [] }).name).not.toBe(files.L2.name);
    const data = buildExperienceData("en", { L1: "L1", L2: "L2", L3: "L3", L4: "L4", RF: "RF" });
    expect([data.career.shapes, data.labs.shapes, data.library.shapes]).toEqual([shapeUrl("L2"), shapeUrl("L3"), shapeUrl("L4")]);
  });

  it("stays small: about 30 KB of JSON on all three floors together", () => {
    const total = SHAPE_FLOORS.reduce((n, f) => n + shapeFiles()[f].json.length, 0);
    expect(total).toBeLessThan(60_000);
  });
});

describe("build-shapes", () => {
  it("writes each floor's file and removes stale ones", () => {
    const dir = path.join(process.cwd(), "test-results", "build-shapes");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "L2.stale00000.json"), "{}");
    const names = writeShapes(dir);
    expect(readdirSync(dir).sort()).toEqual([...names].sort());
    for (const floor of SHAPE_FLOORS) expect(readFileSync(path.join(dir, shapeFiles()[floor].name), "utf8")).toBe(shapeFiles()[floor].json);
    rmSync(dir, { recursive: true, force: true });
    expect(existsSync(dir)).toBe(false);
  });
});

describe("L4 icon placement", () => {
  it("places one icon per docked post (the featured one excepted) and one per paper, model and talk", () => {
    const content = getContent();
    const { icons } = shapePayloads(content).L4;
    const lib = content.floors.library;
    const keys = icons!.map((i) => i.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const i of icons!) expect(i.strokes.length, i.key).toBeGreaterThan(0);
    for (const id of [...lib.publications.map((p) => p.id), ...lib.talks.map((t) => t.id)]) expect(keys).toContain(id);
    // The newsroom features the newest post on its stage (a turning book, no icon).
    expect(keys.filter((k) => lib.posts.some((p) => p.slug === k))).toHaveLength(Math.min(lib.posts.length, 12) - 1);
  });

  it("matches the floor the client builds, in either locale", () => {
    const placed = (locale: "en" | "id") => {
      const library = buildLibraryData(locale);
      return libraryIcons(buildLibraryLayout(libraryLayoutInput(library)), library, {}).map((i) => [i.key, i.x, i.y, i.z, i.face].join(","));
    };
    expect(placed("id")).toEqual(placed("en"));
    expect(shapePayloads().L4.icons!.map((i) => [i.key, i.x, i.y, i.z, i.face].join(","))).toEqual(placed("en"));
  });

  it("keeps desk icons apart and over their desk", () => {
    const { icons } = shapePayloads().L4;
    const desk = icons!.filter((i) => i.size === DESK.size);
    for (const a of desk)
      for (const b of desk) if (a !== b && a.color === b.color) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThanOrEqual(DESK.size);
  });
});

describe("L2 icon placement", () => {
  it("matches the road the client builds, in either locale", () => {
    const placed = (locale: "en" | "id") => careerIcons(buildCareerRoad(careerLayoutInput(buildExperienceData(locale, { L1: "", L2: "", L3: "", L4: "", RF: "" }).career)).rooms, {}).map((i) => [i.key, i.x, i.y, i.z].join(","));
    expect(placed("id")).toEqual(placed("en"));
    expect(shapePayloads().L2.icons!.map((i) => [i.key, i.x, i.y, i.z].join(","))).toEqual(placed("en"));
  });
});
