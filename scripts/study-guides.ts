/**
 * Study guides (L4 Study Vault): prepares the owner's PDFs and uploads them to the private R2 bucket.
 *
 *   bun scripts/study-guides.ts prepare <slug>=<file.pdf> ...   rewrite metadata, object streams, version, cover, safety scan
 *   bun scripts/study-guides.ts upload [<slug> ...]             put the prepared files into R2 (`bunx wrangler`)
 *   bun scripts/study-guides.ts check                           prepared files match content/study-guides.json
 *
 * The PDFs are never committed: prepared files go to `.study-guides/` (gitignored). `prepare` writes the machine
 * fields of each entry in `content/study-guides.json` (`pages`, `bytes`, `version`) and the page 1 cover
 * `public/study-guides/<slug>.webp`; the human fields (title, summary, domains) stay as written. The R2 key is
 * `<slug>/<version>.pdf`, so a new upload never overwrites an object a browser may have cached.
 * Needs qpdf, pdfinfo, pdftotext, pdftoppm (poppler) and cwebp. Runbook: docs/study-guides-runbook.md.
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export const GUIDES_BUCKET = "hq-study-guides";
const ROOT = path.join(import.meta.dir, "..");
const DATA_FILE = path.join(ROOT, "content", "study-guides.json");
const OUT_DIR = path.join(ROOT, ".study-guides");
const COVER_DIR = path.join(ROOT, "public", "study-guides");
const COVER_WIDTH = 480;
const AUTHOR = "Kurniadi Ahmad Wijaya";

interface GuideEntry {
  slug: string;
  code: string | null;
  issuer: string;
  title: { en: string; id: string };
  file: string;
  pages: number;
  bytes: number;
  version: string;
  cover: string;
  [key: string]: unknown;
}

interface GuideFile {
  $comment?: string;
  guides: GuideEntry[];
}

function run(cmd: string, args: string[]): string {
  const result = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.status !== 0) throw new Error(`${cmd} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result.stdout;
}

const readData = (): GuideFile => JSON.parse(readFileSync(DATA_FILE, "utf8")) as GuideFile;
const writeData = (data: GuideFile) => writeFileSync(DATA_FILE, `${JSON.stringify(data, null, 2)}\n`);
export const preparedFile = (slug: string) => path.join(OUT_DIR, `${slug}.pdf`);
export const objectKey = (slug: string, version: string) => `${slug}/${version}.pdf`;
export const versionOf = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex").slice(0, 12);

/** qpdf JSON v2 patch that replaces the document Info dictionary (all four source files carry the AI-103 title). */
export function infoPatch(infoId: number, title: string, subject: string): object {
  return {
    qpdf: [
      { jsonversion: 2, pushedinheritedpageresources: false, calledgetallpages: false, maxobjectid: infoId },
      { [`obj:${infoId} 0 R`]: { value: { "/Title": `u:${title}`, "/Subject": `u:${subject}`, "/Author": `u:${AUTHOR}` } } },
    ],
  };
}

function prepare(pairs: string[]) {
  const data = readData();
  mkdirSync(OUT_DIR, { recursive: true });
  mkdirSync(COVER_DIR, { recursive: true });
  const scratch = mkdtempSync(path.join(tmpdir(), "study-guides-"));
  try {
    for (const pair of pairs) {
      const [slug, source] = pair.split("=");
      const entry = data.guides.find((g) => g.slug === slug);
      if (!entry || !source || !existsSync(source)) throw new Error(`Unknown slug or missing file: ${pair}`);

      const text = run("pdftotext", ["-layout", source, "-"]);
      if (/(?:\+62|\b08\d{2})[\s-]?\d{3,4}[\s-]?\d{3,5}/.test(text)) throw new Error(`${slug}: a phone number in the PDF text`);

      const trailer = run("qpdf", ["--show-object=trailer", source]);
      const infoId = Number(/\/Info (\d+) 0 R/.exec(trailer)?.[1]);
      if (!infoId) throw new Error(`${slug}: no Info dictionary in the trailer`);
      const title = `${entry.code ?? entry.title.en} Study Guide: ${entry.title.en}`;
      const subject = entry.code ? `${entry.issuer} exam ${entry.code}` : `${entry.issuer} ${entry.title.en} certification`;
      const patch = path.join(scratch, `${slug}.json`);
      writeFileSync(patch, JSON.stringify(infoPatch(infoId, title, subject)));
      const out = preparedFile(slug);
      // Object streams, not linearization: qpdf flattens the page tree when it linearizes, and pdf.js then fetches
      // every page object across the file to open it (51 range requests, 3.3 MB of 4.4 MB before page 1). With the
      // small objects (page dictionaries, outline items) packed in object streams it opens in 3 requests (0.16 MB).
      run("qpdf", [source, `--update-from-json=${patch}`, "--object-streams=generate", "--deterministic-id", out]);
      run("qpdf", ["--check", out]);

      const info = run("pdfinfo", [out]);
      if (!info.includes(`Title:           ${title}`)) throw new Error(`${slug}: metadata did not update`);
      const bytes = new Uint8Array(readFileSync(out));
      entry.pages = Number(/Pages:\s+(\d+)/.exec(info)?.[1]);
      entry.bytes = bytes.byteLength;
      entry.version = versionOf(bytes);

      const png = path.join(scratch, slug);
      run("pdftoppm", ["-f", "1", "-l", "1", "-singlefile", "-scale-to-x", String(COVER_WIDTH), "-scale-to-y", "-1", "-png", out, png]);
      run("cwebp", ["-quiet", "-q", "80", "-m", "6", `${png}.png`, "-o", path.join(COVER_DIR, `${slug}.webp`)]);
      entry.cover = `/study-guides/${slug}.webp`;
      console.log(`${slug}: ${entry.pages} pages, ${entry.bytes} bytes, version ${entry.version}`);
    }
    writeData(data);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** Checks the prepared files of `slugs` (every guide when empty) against the JSON and returns those guides. */
function check(slugs: string[] = []): GuideEntry[] {
  const data = readData();
  const unknown = slugs.filter((s) => !data.guides.some((g) => g.slug === s));
  if (unknown.length) throw new Error(`unknown guide ${unknown.join(", ")}`);
  const guides = data.guides.filter((g) => slugs.length === 0 || slugs.includes(g.slug));
  for (const g of guides) {
    const file = preparedFile(g.slug);
    if (!existsSync(file)) throw new Error(`${g.slug}: run prepare first (${file} is missing)`);
    const bytes = new Uint8Array(readFileSync(file));
    if (bytes.byteLength !== g.bytes || versionOf(bytes) !== g.version) throw new Error(`${g.slug}: prepared file does not match content/study-guides.json`);
  }
  return guides;
}

function upload(slugs: string[]) {
  const guides = check(slugs);
  for (const g of guides) {
    const key = `${GUIDES_BUCKET}/${objectKey(g.slug, g.version)}`;
    run("bunx", [
      "wrangler",
      "r2",
      "object",
      "put",
      key,
      "--remote",
      `--file=${preparedFile(g.slug)}`,
      "--content-type=application/pdf",
      "--cache-control=public, max-age=31536000, immutable",
    ]);
    console.log(`uploaded ${key} (${statSync(preparedFile(g.slug)).size} bytes)`);
  }
}

if (import.meta.main) {
  const [command, ...rest] = process.argv.slice(2);
  if (command === "prepare" && rest.length) prepare(rest);
  else if (command === "upload") upload(rest);
  else if (command === "check") console.log(`${check(rest).length} prepared guides match`);
  else {
    console.error("Usage: bun scripts/study-guides.ts prepare <slug>=<file.pdf> ... | upload [<slug> ...] | check [<slug> ...]");
    process.exit(1);
  }
}
