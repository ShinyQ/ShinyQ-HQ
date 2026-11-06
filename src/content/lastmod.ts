/**
 * Sitemap dates for pages whose content carries no full date of its own: case studies, journey entries, the Labs and
 * Journey indexes and the CV. A page's date is the UTC day of the last first-parent commit that changed its slice of
 * the content (`contentSlices`), stamped with that slice's hash in content/generated/content-lastmod.json by
 * `bun scripts/content-lastmod.ts --write` (run from the git history before every CI and deploy build, like the build
 * facts). A page whose slice no longer matches its stamp (an uncommitted edit, a stale file) gets no date until the
 * next stamp: never a guessed one. Server only (node:fs).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const LASTMOD_FILE = path.join(process.cwd(), "content", "generated", "content-lastmod.json");
/** The sources the slices come from, relative to the repository root (the script reads them at every commit). */
export const LASTMOD_SOURCES = { content: "content/site-content.json", cv: "content/generated/cv-pages.json" } as const;

export interface LastmodStamp {
  /** `sliceHash` of the page's slice when it last changed. */
  hash: string;
  /** UTC day (`YYYY-MM-DD`) of the commit that made that change. */
  date: string;
}

export type LastmodStamps = Record<string, LastmodStamp>;

type Json = Record<string, unknown> | undefined;
type Slugged = { slug?: unknown };

/**
 * Each stamped page's slice of the raw sources, keyed by locale-relative path: a case study its pod, a journey
 * entry its entry, Labs and Journey their whole floor (every card they list), the CV its PDF's sha256.
 */
export function contentSlices(content: Json, cvPages: Json): Record<string, unknown> {
  const floors = (content?.floors ?? {}) as { labs?: { pods?: Slugged[] }; careerArchive?: { entries?: Slugged[] } };
  const out: Record<string, unknown> = {};
  if (floors.labs) out["/labs"] = floors.labs;
  for (const pod of floors.labs?.pods ?? []) if (typeof pod.slug === "string") out[`/labs/${pod.slug}`] = pod;
  if (floors.careerArchive) out["/journey"] = floors.careerArchive;
  for (const entry of floors.careerArchive?.entries ?? []) if (typeof entry.slug === "string") out[`/journey/${entry.slug}`] = entry;
  if (typeof cvPages?.sha256 === "string") out["/cv"] = cvPages.sha256;
  return out;
}

/** JSON with sorted object keys, so a reformatted or reordered file hashes the same. */
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    return `{${entries
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableJson(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function sliceHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex").slice(0, 16);
}

/** `sliceHash` of every page in `contentSlices`. */
export function sliceHashes(content: Json, cvPages: Json): Record<string, string> {
  return Object.fromEntries(Object.entries(contentSlices(content, cvPages)).map(([page, slice]) => [page, sliceHash(slice)]));
}

const readJson = (file: string): Json => {
  const full = path.join(process.cwd(), file);
  return existsSync(full) ? (JSON.parse(readFileSync(full, "utf8")) as Json) : undefined;
};

let stamps: LastmodStamps | undefined;
let current: Record<string, string> | undefined;

/** The stamped day of a page whose content is unchanged since its stamp; undefined for any other page. */
export function stampedDate(page: string): string | undefined {
  stamps ??= existsSync(LASTMOD_FILE) ? (JSON.parse(readFileSync(LASTMOD_FILE, "utf8")) as LastmodStamps) : {};
  current ??= sliceHashes(readJson(LASTMOD_SOURCES.content), readJson(LASTMOD_SOURCES.cv));
  const stamp = stamps[page];
  return stamp && stamp.hash === current[page] ? stamp.date : undefined;
}
