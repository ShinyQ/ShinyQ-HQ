import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { HologramPart } from "@/experience/floors/labs/hologramParts";
import { libraryIcons, type PlacedIcon } from "@/experience/floors/library/icons";
import { buildLibraryLayout } from "@/experience/floors/library/layout";
import { libraryLayoutInput } from "@/experience/floors/library/model";
import type { Stroke } from "@/experience/fx/holoIcons";
import { svgToStrokes } from "@/lib/svg-strokes";
import { buildLibraryData } from "./experience-floors";
import { getContent } from "./load";
import type { SiteContent } from "./schema";
import { expandSculptures, sculptureIssues, sculptureSignature, type SculptureFile } from "./sculptures";

/**
 * The floating hologram shapes of L2, L3 and L4 (owner decision 2026-10-23): one static JSON per floor,
 * `public/shapes/<floor>.<hash>.json`, written by `scripts/build-shapes.ts` before `next build` and fetched by the 3D
 * floor after its first frame (`experience/fx/shapes.ts`). The hashed URL reaches the client in the experience data
 * (`shapeUrls`), computed by the same function as the file, so it always names the file the build wrote. Server and
 * build only: reads the vendored Lucide icons and the sculpture recipes from disk, never bundled.
 */

export const ICON_DIR = path.join(process.cwd(), "assets", "icons", "lucide");
export const SCULPTURE_FILE = path.join(process.cwd(), "content", "sculptures.json");
export const SHAPES_DIR = "shapes";

export const SHAPE_FLOORS = ["L2", "L3", "L4"] as const;
export type ShapeFloor = (typeof SHAPE_FLOORS)[number];

/** Milestones and awards cycle a few icons (owner decision): at most this many distinct ids each. */
export const SHARED_ICON_MAX = { milestone: 4, award: 3 } as const;

/**
 * One floor's payload: item key (career slug, pod slug, post slug, publication or talk id) to its shape. L4 also
 * carries `icons`, every item icon placed on the floor's layout (`libraryIcons`), so the client only draws them.
 */
export interface ShapePayload {
  v: 1;
  floor: ShapeFloor;
  items: Record<string, Stroke[] | HologramPart[]>;
  icons?: PlacedIcon[];
}

/**
 * The L4 item icons on the layout the floor builds (`buildLibraryLayout` over `buildLibraryData`, the same inputs as
 * the client; the stations and the desk order do not depend on the locale), for the keys that have an icon.
 */
export function placedLibraryIcons(items: Record<string, unknown>): PlacedIcon[] {
  const library = buildLibraryData("en");
  return libraryIcons(buildLibraryLayout(libraryLayoutInput(library)), library).filter(([key]) => items[key]);
}

const strokeCache = new Map<string, Stroke[]>();

export const iconFile = (id: string) => path.join(ICON_DIR, `${id}.svg`);
export const iconExists = (id: string) => existsSync(iconFile(id));

/** A vendored Lucide icon as 24 x 24 strokes (converted once per process). */
export function iconStrokes(id: string): Stroke[] {
  let strokes = strokeCache.get(id);
  if (!strokes) {
    strokes = svgToStrokes(readFileSync(iconFile(id), "utf8"));
    strokeCache.set(id, strokes);
  }
  return strokes;
}

let sculptureCache: Record<string, HologramPart[]> | undefined;

/** Every sculpture recipe, expanded (`content/sculptures.json`). */
export function getSculptures(): Record<string, HologramPart[]> {
  sculptureCache ??= expandSculptures(JSON.parse(readFileSync(SCULPTURE_FILE, "utf8")) as SculptureFile);
  return sculptureCache;
}

/** Problems with the hologram ids in `content` (empty when every id resolves and the shared ones stay few). */
export function shapeIssues(content: SiteContent, sculptures = getSculptures()): string[] {
  const issues: string[] = [];
  const { careerArchive, labs, library } = content.floors;
  const icon = (where: string, id: string | undefined) => {
    if (id && !iconExists(id)) issues.push(`${where}: icon "${id}" has no SVG in assets/icons/lucide/`);
  };
  for (const e of careerArchive.entries) icon(`career entry ${e.slug}`, e.icon);
  for (const p of library.posts) icon(`post ${p.slug}`, p.icon);
  for (const p of library.publications) icon(`publication ${p.id}`, p.icon);
  for (const t of library.talks) icon(`talk ${t.id}`, t.icon);
  for (const p of labs.pods) {
    if (p.sculpture && !sculptures[p.sculpture]) issues.push(`pod ${p.slug}: sculpture "${p.sculpture}" is not in content/sculptures.json`);
  }
  for (const type of ["milestone", "award"] as const) {
    const ids = new Set(careerArchive.entries.filter((e) => e.type === type && e.icon).map((e) => e.icon));
    if (ids.size > SHARED_ICON_MAX[type]) issues.push(`${type} icons: ${ids.size} variants (at most ${SHARED_ICON_MAX[type]})`);
  }
  const signatures = new Map<string, string>();
  for (const [id, parts] of Object.entries(sculptures)) {
    issues.push(...sculptureIssues(id, parts));
    const sig = sculptureSignature(parts);
    const twin = signatures.get(sig);
    if (twin) issues.push(`sculptures "${twin}" and "${id}" are identical`);
    signatures.set(sig, id);
  }
  return issues;
}

/** Each floor's payload from the content (items without an id are left out: they keep the fallback). */
export function shapePayloads(content: SiteContent = getContent()): Record<ShapeFloor, ShapePayload> {
  const issues = shapeIssues(content);
  if (issues.length) throw new Error(`Hologram shapes:\n${issues.join("\n")}`);
  const { careerArchive, labs, library } = content.floors;
  const sculptures = getSculptures();
  const icons = (items: { key: string; icon?: string }[]) => Object.fromEntries(items.filter((i) => i.icon).map((i) => [i.key, iconStrokes(i.icon!)]));
  const l4 = icons([
    ...library.posts.map((p) => ({ key: p.slug, icon: p.icon })),
    ...library.publications.map((p) => ({ key: p.id, icon: p.icon })),
    ...library.talks.map((t) => ({ key: t.id, icon: t.icon })),
  ]);
  return {
    L2: { v: 1, floor: "L2", items: icons(careerArchive.entries.map((e) => ({ key: e.slug, icon: e.icon }))) },
    L3: { v: 1, floor: "L3", items: Object.fromEntries(labs.pods.filter((p) => p.sculpture).map((p) => [p.slug, sculptures[p.sculpture!]])) },
    L4: { v: 1, floor: "L4", items: l4, icons: placedLibraryIcons(l4) },
  };
}

/** A payload's file: its JSON and the content-hashed name (`L2.0123456789.json`). */
export function shapeFile(payload: ShapePayload): { name: string; json: string } {
  const json = JSON.stringify(payload);
  return { name: `${payload.floor}.${createHash("sha256").update(json).digest("hex").slice(0, 10)}.json`, json };
}

let fileCache: Record<ShapeFloor, { name: string; json: string }> | undefined;

/** Every floor's file for the site content (cached per process). */
export function shapeFiles(): Record<ShapeFloor, { name: string; json: string }> {
  if (!fileCache) {
    const payloads = shapePayloads();
    fileCache = Object.fromEntries(SHAPE_FLOORS.map((f) => [f, shapeFile(payloads[f])])) as Record<ShapeFloor, { name: string; json: string }>;
  }
  return fileCache;
}

/** The public URL of a floor's shapes (`/shapes/L2.<hash>.json`), for the experience data. */
export const shapeUrl = (floor: ShapeFloor) => `/${SHAPES_DIR}/${shapeFiles()[floor].name}`;
