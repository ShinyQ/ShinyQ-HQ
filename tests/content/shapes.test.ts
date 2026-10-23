import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildExperienceData } from "@/content/experience";
import { getContent } from "@/content/load";
import { hologramIdClashes, type SiteContent } from "@/content/schema";
import { iconStrokes, SHAPE_FLOORS, shapeFile, shapeFiles, shapeIssues, shapePayloads, shapeUrl } from "@/content/shapes";
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
  it("keys L2 by entry slug, L3 by pod slug and L4 by post slug, publication id and talk id", () => {
    const content = getContent();
    const payloads = shapePayloads(content);
    const { careerArchive, labs, library } = content.floors;
    expect(Object.keys(payloads.L2.items).sort()).toEqual(careerArchive.entries.map((e) => e.slug).sort());
    expect(Object.keys(payloads.L3.items).sort()).toEqual(labs.pods.map((p) => p.slug).sort());
    expect(Object.keys(payloads.L4.items).sort()).toEqual([...library.posts.map((p) => p.slug), ...library.publications.map((p) => p.id), ...library.talks.map((t) => t.id)].sort());
    expect(payloads.L2.items["graduation-2023"]).toEqual(iconStrokes("graduation-cap"));
    for (const parts of Object.values(payloads.L3.items)) expect(parts.length).toBeGreaterThan(0);
  });

  it("leaves items without an id out (they keep the fallback)", () => {
    const content = clone();
    delete content.floors.library.talks[0].icon;
    delete content.floors.labs.pods[0].sculpture;
    const payloads = shapePayloads(content);
    expect(payloads.L4.items[content.floors.library.talks[0].id]).toBeUndefined();
    expect(payloads.L3.items[content.floors.labs.pods[0].slug]).toBeUndefined();
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
    expect(shapeFile({ ...payload, items: {} }).name).not.toBe(files.L2.name);
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
