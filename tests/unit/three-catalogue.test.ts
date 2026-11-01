import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { THREE_CATALOGUE } from "@/experience/scene/threeCatalogue";
import { ROOT } from "../helpers/import-graph";

const read = (file: string) => readFileSync(join(ROOT, file), "utf8");
const tsx = (dir: string) =>
  (readdirSync(join(ROOT, dir), { recursive: true }) as string[]).filter((f) => f.endsWith(".tsx") && !f.includes(".test.")).map((f) => join(dir, f));

/** three's classes by their JSX element name (`Mesh` is `<mesh>`). */
const ELEMENTS = new Map(
  Object.entries(THREE)
    .filter(([name, value]) => /^[A-Z]/.test(name) && typeof value === "function")
    .map(([name]) => [name[0].toLowerCase() + name.slice(1), name]),
);
const TAG = /<([a-z][A-Za-z0-9]*)(?=[\s/>])/g;
/** 3D files only: DOM components (the gate's SVG `<path>`, for example) render HTML elements with the same names. */
const IMPORTS_3D = /from\s+"(?:three|@react-three\/(?:fiber|drei))"/;

/** Every three class the 3D tree renders as a JSX element, with one file that renders it. */
function renderedClasses(): Map<string, string> {
  const used = new Map<string, string>();
  const drei = new Set<string>();
  for (const file of [...tsx("src/experience"), ...tsx("src/hud"), ...tsx("src/components")]) {
    const text = read(file);
    for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*"@react-three\/drei"/g)) for (const n of m[1].split(",")) if (n.trim()) drei.add(n.trim());
    if (!file.startsWith("src/experience/") || !IMPORTS_3D.test(text)) continue;
    for (const m of text.matchAll(TAG)) {
      const name = ELEMENTS.get(m[1]);
      if (name && !used.has(name)) used.set(name, file);
    }
  }
  // drei components render three elements of their own (RoundedBox an `<extrudeGeometry>`): read the module each
  // imported name comes from (drei's index re-exports `core/` and `web/` modules, several names per module).
  const dreiIndex = read("node_modules/@react-three/drei/index.js") + read("node_modules/@react-three/drei/core/index.js");
  for (const component of drei) {
    const from = new RegExp(`export \\{[^}]*\\b${component}\\b[^}]*\\} from '\\./((?:core|web)/)?([\\w/]+\\.js)'`).exec(dreiIndex);
    if (!from) throw new Error(`drei export ${component} not found in its index`);
    const file = `node_modules/@react-three/drei/${from[1] ?? "core/"}${from[2]}`;
    for (const m of read(file).matchAll(/createElement\("([a-z][A-Za-z0-9]*)"/g)) {
      const name = ELEMENTS.get(m[1]);
      if (name && !used.has(name)) used.set(name, `drei ${component}`);
    }
  }
  return used;
}

describe("three catalogue (perf 3D-1)", () => {
  const used = renderedClasses();
  const catalogue = Object.keys(THREE_CATALOGUE);

  it("registers every three class the 3D tree renders as a JSX element", () => {
    const missing = [...used].filter(([name]) => !catalogue.includes(name)).map(([name, file]) => `${name} (${file})`);
    expect(missing, "add these to THREE_CATALOGUE in src/experience/scene/threeCatalogue.ts").toEqual([]);
  });

  it("registers nothing the 3D tree does not render, so unused three classes stay tree-shaken", () => {
    expect(catalogue.filter((name) => !used.has(name))).toEqual([]);
  });

  it("maps every entry to the three class of the same name", () => {
    for (const [name, value] of Object.entries(THREE_CATALOGUE)) expect(value).toBe((THREE as Record<string, unknown>)[name]);
  });

  it("is registered by every file that renders an R3F Canvas", () => {
    const canvases = tsx("src").filter((file) => /import\s*\{[^}]*\bCanvas\b[^}]*\}\s*from\s*"@react-three\/fiber"/.test(read(file)));
    expect(canvases.length).toBeGreaterThan(0);
    for (const file of canvases) expect(read(file), file).toMatch(/^registerThreeCatalogue\(\);$/m);
  });

  it("keeps R3F's Canvas from registering the whole three namespace (the bun patch still applies)", () => {
    const pkg = JSON.parse(read("package.json")) as { patchedDependencies?: Record<string, string>; dependencies: Record<string, string> };
    const fiber = JSON.parse(read("node_modules/@react-three/fiber/package.json")) as { version: string };
    expect(Object.keys(pkg.patchedDependencies ?? {}), "re-create the patch for the installed @react-three/fiber (docs/agents/ci-and-deploy.md)").toContain(`@react-three/fiber@${fiber.version}`);
    for (const dist of ["react-three-fiber.esm.js", "react-three-fiber.cjs.dev.js", "react-three-fiber.cjs.prod.js"]) {
      expect(read(`node_modules/@react-three/fiber/dist/${dist}`), dist).not.toMatch(/extend\(THREE(?:__namespace)?\)/);
    }
  });
});
