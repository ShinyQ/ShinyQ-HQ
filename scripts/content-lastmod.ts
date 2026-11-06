#!/usr/bin/env bun
/**
 * Content stamps for the sitemap `lastmod` (src/content/lastmod.ts): walks the first-parent history of HEAD, hashes
 * each stamped page's slice of content/site-content.json and content/generated/cv-pages.json at every commit that
 * changed either file, and records the UTC day of the commit where the slice last changed.
 *
 *   bun scripts/content-lastmod.ts [--write]
 *
 * Prints a summary; `--write` writes content/generated/content-lastmod.json only when it differs. Needs the full
 * history (CI and deploy check out with fetch-depth 0, before `build-facts.ts`); in a shallow clone or outside git it
 * keeps the committed file and exits 0. Pages edited after HEAD (an uncommitted change) keep no date until committed.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { LASTMOD_FILE, LASTMOD_SOURCES, type LastmodStamps, sliceHashes } from "../src/content/lastmod";

const git = (args: string[]) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 }).trim();

/** Blob ids of the sources at a commit ("" when a file does not exist there). */
function blobs(commit: string): string[] {
  const files = Object.values(LASTMOD_SOURCES);
  const rows = git(["ls-tree", commit, "--", ...files]).split("\n").filter(Boolean);
  const byPath = new Map(rows.map((row) => [row.split("\t")[1], row.split(/\s+/)[2]]));
  return files.map((file) => byPath.get(file) ?? "");
}

const parseBlob = (blob: string) => (blob ? (JSON.parse(git(["cat-file", "-p", blob])) as Record<string, unknown>) : undefined);

/** Stamps from the first-parent history of HEAD: for each page alive at HEAD, its hash and the day it last changed. */
export function stampsFromHistory(): LastmodStamps {
  const commits = git(["log", "--first-parent", "--reverse", "--format=%H %ct", "HEAD"]).split("\n").filter(Boolean);
  let stamps: LastmodStamps = {};
  let previous = "";
  for (const row of commits) {
    const [commit, seconds] = row.split(" ");
    const ids = blobs(commit);
    if (ids.join() === previous) continue;
    previous = ids.join();
    const date = new Date(Number(seconds) * 1000).toISOString().slice(0, 10);
    const hashes = sliceHashes(parseBlob(ids[0]), parseBlob(ids[1]));
    stamps = Object.fromEntries(
      Object.entries(hashes).map(([page, hash]) => [page, stamps[page]?.hash === hash ? stamps[page] : { hash, date }]),
    );
  }
  return Object.fromEntries(Object.entries(stamps).sort(([a], [b]) => (a < b ? -1 : 1)));
}

if (import.meta.main) {
  let shallow = "true";
  try {
    shallow = git(["rev-parse", "--is-shallow-repository"]);
  } catch {
    // Not a git checkout.
  }
  if (shallow !== "false") {
    console.warn("content-lastmod: no full git history here; keeping the committed content/generated/content-lastmod.json");
    process.exit(0);
  }
  const stamps = stampsFromHistory();
  const next = `${JSON.stringify(stamps, null, 2)}\n`;
  const before = existsSync(LASTMOD_FILE) ? readFileSync(LASTMOD_FILE, "utf8") : "";
  const dates = Object.values(stamps).map((s) => s.date).sort();
  console.log(`content-lastmod: ${dates.length} pages stamped, ${dates[0]} to ${dates.at(-1)}${before === next ? ", unchanged" : ""}`);
  if (process.argv.includes("--write") && before !== next) writeFileSync(LASTMOD_FILE, next);
}
