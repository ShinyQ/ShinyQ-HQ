import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_NAMESPACES, LAYOUT_NAMESPACES, pickMessages } from "@/i18n/client-messages";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

const ROOT = join(__dirname, "../..");
const SRC = join(ROOT, "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith(".d.ts") ? [path] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = join(dirname(from), spec);
  else return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (existsSync(candidate) && statSync(candidate).isFile() && /\.tsx?$/.test(candidate)) return candidate;
  }
  return null;
}

const IMPORT = /(?:import|export)\s+(type\s+)?[^"';]*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)|^import\s+["']([^"']+)["']/gm;

function importsOf(file: string, text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(IMPORT)) {
    if (m[1]) continue; // type-only import
    const target = resolveImport(file, m[2] ?? m[3] ?? m[4]);
    if (target) out.push(target);
  }
  return out;
}

const TEXTS = new Map(sourceFiles(SRC).map((f) => [f, readFileSync(f, "utf8")]));
const text = (file: string) => TEXTS.get(file) ?? readFileSync(file, "utf8");
const isClient = (file: string) => /^\s*["']use client["'];?/m.test(text(file).split("\n").slice(0, 5).join("\n"));

/** Everything the given modules import, transitively. */
function closure(roots: string[]): Set<string> {
  const seen = new Set<string>();
  const stack = [...roots];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    stack.push(...importsOf(file, text(file)));
  }
  return seen;
}

/** The client modules a server entry (layout or page) renders: walk server modules up to each "use client" boundary. */
function clientGraphOf(entry: string): Set<string> {
  const seen = new Set<string>();
  const boundaries: string[] = [];
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (isClient(file)) boundaries.push(file);
    else stack.push(...importsOf(file, text(file)));
  }
  return closure(boundaries);
}

/** Top-level namespaces read with useTranslations, plus problems that make the lists unverifiable. */
function namespacesOf(files: Iterable<string>) {
  const used = new Map<string, string>();
  const problems: string[] = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    const source = text(file);
    if (/\buseMessages\(/.test(source)) problems.push(`${rel}: useMessages reads every namespace`);
    for (const m of source.matchAll(/\buseTranslations\(([^)]*)\)/g)) {
      const literal = /^["'`]([A-Za-z0-9_.]+)["'`]$/.exec(m[1].trim());
      if (literal) used.set(literal[1].split(".")[0], rel);
      else problems.push(`${rel}: useTranslations(${m[1].trim()}) needs a literal namespace`);
    }
  }
  return { used, problems };
}

const missingFrom = (used: Map<string, string>, list: readonly string[]) =>
  [...used].filter(([ns]) => !list.includes(ns)).map(([ns, rel]) => `${ns} (${rel})`);

describe("client message namespaces", () => {
  const allClient = closure([...TEXTS.keys()].filter(isClient));
  const LOCALE = join(SRC, "app/[locale]");
  const pages = sourceFiles(LOCALE).filter((f) => f.endsWith("/page.tsx"));

  it("finds the client graph and every locale page", () => {
    expect(allClient.size).toBeGreaterThan(100);
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });

  it("CLIENT_NAMESPACES lists exactly what client modules read", () => {
    const { used, problems } = namespacesOf(allClient);
    expect(problems).toEqual([]);
    expect(missingFrom(used, CLIENT_NAMESPACES)).toEqual([]);
    expect(CLIENT_NAMESPACES.filter((ns) => !used.has(ns))).toEqual([]);
  });

  it("LAYOUT_NAMESPACES lists exactly what the locale layout's client islands read", () => {
    const { used } = namespacesOf(clientGraphOf(join(LOCALE, "layout.tsx")));
    expect(missingFrom(used, LAYOUT_NAMESPACES)).toEqual([]);
    expect(LAYOUT_NAMESPACES.filter((ns) => !used.has(ns))).toEqual([]);
  });

  it("every page either fits the layout's namespaces or wraps its content in ClientMessages", () => {
    const wrong: string[] = [];
    for (const page of pages) {
      const wrapped = /return \(\s*<ClientMessages>/.test(text(page));
      const { used } = namespacesOf(clientGraphOf(page));
      const missing = missingFrom(used, wrapped ? CLIENT_NAMESPACES : LAYOUT_NAMESPACES);
      if (missing.length) wrong.push(`${relative(ROOT, page)}: ${missing.join(", ")}`);
    }
    expect(wrong).toEqual([]);
  });

  it("names namespaces that exist in both locales, and picks only those", () => {
    for (const ns of CLIENT_NAMESPACES) {
      expect(en).toHaveProperty(ns);
      expect(id).toHaveProperty(ns);
    }
    const picked = pickMessages(en, CLIENT_NAMESPACES);
    expect(Object.keys(picked).sort()).toEqual([...CLIENT_NAMESPACES].sort());
    expect(picked).not.toHaveProperty("seo");
    expect(picked.hud).toBe(en.hud);
    expect(Object.keys(pickMessages(en, LAYOUT_NAMESPACES)).sort()).toEqual([...LAYOUT_NAMESPACES].sort());
  });
});
