import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { CLIENT_NAMESPACES, FETCHED_NAMESPACES, LAYOUT_NAMESPACES, omitMessages, pickMessages, SERVER_PATHS } from "@/i18n/client-messages";
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

/**
 * The files that fetch each FETCHED_NAMESPACES namespace with their data and read it under their own nested
 * provider (the study guide dialog, its lazy reader and the reader toolbar). Only these files may read the namespace without the
 * layout or `ClientMessages` sending it; the same read anywhere else still has to be covered.
 */
const FETCHING_FILES: Record<(typeof FETCHED_NAMESPACES)[number], readonly string[]> = {
  guides: ["src/components/guides/GuideDialog.tsx", "src/components/guides/GuideReader.tsx", "src/components/guides/GuideToolbar.tsx", "src/components/guides/GuideControls.tsx"],
};
const isFetchedRead = (rel: string, path: string) =>
  (FETCHING_FILES as Record<string, readonly string[] | undefined>)[path.split(".")[0]]?.includes(rel) ?? false;

/**
 * Namespaces read with useTranslations (top level, or the full literal path with `paths`), plus problems that
 * make the lists unverifiable. `fetched` drops the reads of a fetched namespace inside the file that fetches it.
 */
function namespacesOf(files: Iterable<string>, { paths = false, fetched = false } = {}, read = text) {
  const used = new Map<string, string>();
  const problems: string[] = [];
  for (const file of files) {
    const rel = relative(ROOT, file);
    const source = read(file);
    if (/\buseMessages\(/.test(source)) problems.push(`${rel}: useMessages reads every namespace`);
    for (const m of source.matchAll(/\buseTranslations\(([^)]*)\)/g)) {
      const literal = /^["'`]([A-Za-z0-9_.]+)["'`]$/.exec(m[1].trim());
      if (!literal) problems.push(`${rel}: useTranslations(${m[1].trim()}) needs a literal namespace`);
      else if (!(fetched && isFetchedRead(rel, literal[1]))) used.set(paths ? literal[1] : literal[1].split(".")[0], rel);
    }
  }
  return { used, problems };
}

/** `list` covers a used path when it lists the path or one of its parents (`hud.palette` covers `hud.palette.empty`). */
const covers = (list: readonly string[], path: string) => list.some((l) => path === l || path.startsWith(`${l}.`));
const missingFrom = (used: Map<string, string>, list: readonly string[]) =>
  [...used].filter(([ns]) => !covers(list, ns)).map(([ns, rel]) => `${ns} (${rel})`);

/**
 * Whether a module that reads the namespace of a SERVER_PATHS entry (`office`) may read the server-only sub-path
 * (`classic`): a key starting with it in any quote (`t("classic.title")`, `t('classic.x')`, `` t(`classic.${k}`) ``,
 * `t.raw("classic")`), or a `t.raw` whose key is not a plain string literal (it could resolve to the sub-path).
 */
function readsServerPath(source: string, path: string): boolean {
  const [ns, ...rest] = path.split(".");
  const esc = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`\\buseTranslations\\(\\s*["'\`]${esc(ns)}["'\`]\\s*\\)`).test(source)) return false;
  return new RegExp(`["'\`]${esc(rest.join("."))}(\\.|["'\`])`).test(source) || /\.raw\(\s*(?!(["'])[^"'`$]*\1\s*\))/.test(source);
}

describe("client message namespaces", () => {
  const allClient = closure([...TEXTS.keys()].filter(isClient));
  const LOCALE = join(SRC, "app/[locale]");
  const pages = sourceFiles(LOCALE).filter((f) => f.endsWith("/page.tsx"));

  it("finds the client graph and every locale page", () => {
    expect(allClient.size).toBeGreaterThan(100);
    expect(pages.length).toBeGreaterThanOrEqual(10);
  });

  it("CLIENT_NAMESPACES lists exactly what client modules read", () => {
    // A fetched namespace read only by the files that fetch it never needs `ClientMessages`.
    const { used, problems } = namespacesOf(allClient, { fetched: true });
    expect(problems).toEqual([]);
    expect(missingFrom(used, CLIENT_NAMESPACES)).toEqual([]);
    expect(CLIENT_NAMESPACES.filter((ns) => !used.has(ns))).toEqual([]);
  });

  it("LAYOUT_NAMESPACES lists exactly what the locale layout's client islands read", () => {
    const { used } = namespacesOf(clientGraphOf(join(LOCALE, "layout.tsx")), { paths: true, fetched: true });
    expect(missingFrom(used, LAYOUT_NAMESPACES)).toEqual([]);
    expect(LAYOUT_NAMESPACES.filter((l) => ![...used.keys()].some((p) => covers([l], p)))).toEqual([]);
    // The 3D HUD's strings (settings, pads, rooms) stay off the Classic pages: the layout never sends all of `hud`.
    expect(LAYOUT_NAMESPACES).not.toContain("hud");
    expect(LAYOUT_NAMESPACES).not.toContain("dialog");
    // Dialogs that fetch their own strings (the study guide reader) keep them off every page's HTML.
    for (const ns of FETCHED_NAMESPACES) expect((LAYOUT_NAMESPACES as readonly string[]).some((l) => l === ns || l.startsWith(`${ns}.`))).toBe(false);
    // Nor in `ClientMessages`: no island under it reads them, so they would only add bytes to every wrapped page.
    for (const ns of FETCHED_NAMESPACES) expect(CLIENT_NAMESPACES).not.toContain(ns);
  });

  it("exempts a fetched namespace only inside the files that fetch it", () => {
    expect(Object.keys(FETCHING_FILES).sort()).toEqual([...FETCHED_NAMESPACES].sort());
    for (const files of Object.values(FETCHING_FILES)) for (const rel of files) expect(TEXTS.has(join(ROOT, rel)), rel).toBe(true);
    const sources: Record<string, string> = {
      "src/components/guides/GuideDialog.tsx": `const t = useTranslations("guides"); const d = useTranslations("dialog.menu");`,
      "src/components/guides/GuideReader.tsx": `const t = useTranslations("guides.pageOf");`,
      "src/components/library/GuideShelf.tsx": `const t = useTranslations("guides");`,
      "src/components/CertDialog.tsx": `const t = useTranslations("guides.readGuide");`,
    };
    const files = Object.keys(sources).map((rel) => join(ROOT, rel));
    const read = (file: string) => sources[relative(ROOT, file)];
    const { used } = namespacesOf(files, { paths: true, fetched: true }, read);
    expect(missingFrom(used, LAYOUT_NAMESPACES).sort()).toEqual([
      "guides (src/components/library/GuideShelf.tsx)",
      "guides.readGuide (src/components/CertDialog.tsx)",
    ]);
    // The fetching dialog's other reads are still checked.
    expect(used.get("dialog.menu")).toBe("src/components/guides/GuideDialog.tsx");
    // Without the exemption every read counts.
    expect([...namespacesOf(files, { paths: true }, read).used.keys()]).toContain("guides.pageOf");
  });

  it("every page either fits the layout's namespaces or wraps its content in ClientMessages", () => {
    const wrong: string[] = [];
    for (const page of pages) {
      const wrapped = /return \(\s*<ClientMessages>/.test(text(page));
      const { used } = namespacesOf(clientGraphOf(page), { paths: true, fetched: true });
      const missing = missingFrom(used, wrapped ? CLIENT_NAMESPACES : LAYOUT_NAMESPACES);
      if (missing.length) wrong.push(`${relative(ROOT, page)}: ${missing.join(", ")}`);
    }
    expect(wrong).toEqual([]);
  });

  it("keeps the server-only sub-paths (SERVER_PATHS) out of ClientMessages and out of every client module", () => {
    expect(SERVER_PATHS).toContain("office.classic");
    const { used } = namespacesOf(allClient, { paths: true });
    expect([...used].filter(([p]) => covers(SERVER_PATHS, p)).map(([p, rel]) => `${p} (${rel})`)).toEqual([]);
    for (const path of SERVER_PATHS) {
      // A client module reading the namespace never reads the server-only keys (`t("classic.title")`).
      expect([...allClient].filter((f) => readsServerPath(text(f), path)).map((f) => relative(ROOT, f))).toEqual([]);
      for (const messages of [en, id]) expect(path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], messages), path).toBeDefined();
    }
    const before = JSON.stringify(en);
    const client = omitMessages(pickMessages(en, CLIENT_NAMESPACES), SERVER_PATHS);
    expect(JSON.stringify(en)).toBe(before);
    expect(client.office).not.toHaveProperty("classic");
    const office = client.office as Record<string, unknown>;
    // The rest of the namespace stays, as the same objects.
    expect(Object.keys(office).sort()).toEqual(Object.keys(en.office).filter((k) => k !== "classic").sort());
    expect(office["3d"]).toBe(en.office["3d"]);
    expect(client.hud).toBe(en.hud);
  });

  it("catches every way a client module could read a server-only path", () => {
    const reader = (body: string) => `const t = useTranslations("office");\n${body}`;
    for (const body of [
      't("classic.title")',
      "t('classic.title')",
      "t(`classic.${key}`)",
      't.raw("classic")',
      "t.raw('classic.counts')",
      "t.raw(key)",
      "t.raw(`${key}`)",
    ])
      expect(readsServerPath(reader(body), "office.classic"), body).toBe(true);
    expect(readsServerPath("const t = useTranslations('office');\nt(`classic.title`)", "office.classic")).toBe(true);
    for (const body of ['t("3d.offDuty")', 't("classicist")', 't.raw("3d.github")', 't(`activity.${a}`)'])
      expect(readsServerPath(reader(body), "office.classic"), body).toBe(false);
    // Only modules that read the namespace count: another namespace's "classic" key is fine.
    expect(readsServerPath('const t = useTranslations("hud");\nt("classic.title")', "office.classic")).toBe(false);
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
    const layout = pickMessages(en, LAYOUT_NAMESPACES);
    expect(Object.keys(layout).sort()).toEqual([...new Set(LAYOUT_NAMESPACES.map((p) => p.split(".")[0]))].sort());
    for (const path of LAYOUT_NAMESPACES) {
      for (const messages of [en, id]) {
        const value = path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], messages);
        expect(value, path).toBeDefined();
      }
      // The same object, so React dedupes it against a page's full namespaces.
      expect(path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], layout)).toBe(
        path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], en),
      );
    }
    expect(Object.keys(layout.hud as object).sort()).toEqual(["launcher", "palette", "status", "terminal"]);
  });
});
