/**
 * Turbopack loader of src/app/client-sheet.css (next.config.ts): the second stylesheet, which the client entries import
 * (scripts/client-sheet/sources.ts). It ignores the file's own text. It runs the Tailwind loader on globals.css twice,
 * as is (the Classic sheet: the lazy-only sources skipped) and without the lazy-sources import (the full sheet), and
 * returns what the full sheet adds (./split.mjs). Both runs report their dependencies, so `next dev` rebuilds it.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import tailwind from "@tailwindcss/turbopack";
import { LAZY_SOURCES_IMPORT, splitClientSheet } from "./split.mjs";

/** One Tailwind run through the real loader, flat and unminified (Next minifies the result). */
function runTailwind(loader, resourcePath, variant, source) {
  return new Promise((resolve, reject) => {
    const context = {
      async: () => (error, css) => (error ? reject(error) : resolve(String(css))),
      getOptions: () => ({ optimize: { minify: false } }),
      resourcePath,
      // Its own cache entry: the Tailwind loader caches one compiler per resource.
      resource: `${resourcePath}?client-sheet=${variant}`,
      addDependency: (file) => loader.addDependency(file),
      addContextDependency: (dir) => loader.addContextDependency(dir),
    };
    Promise.resolve(tailwind.call(context, source)).catch(reject);
  });
}

export default function clientSheetLoader() {
  const done = this.async();
  const globals = path.join(path.dirname(this.resourcePath), "globals.css");
  this.addDependency(globals);
  const source = readFileSync(globals, "utf8");
  if (source.split(LAZY_SOURCES_IMPORT).length !== 2) {
    done(new Error(`client-sheet: globals.css must contain ${LAZY_SOURCES_IMPORT} exactly once`));
    return;
  }
  Promise.all([runTailwind(this, globals, "classic", source), runTailwind(this, globals, "full", source.replace(LAZY_SOURCES_IMPORT, ""))])
    .then(([classic, full]) => done(null, splitClientSheet(full, classic)))
    .catch((error) => done(error));
}
