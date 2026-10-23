/**
 * Writes the floating hologram shapes of L2, L3 and L4 (`src/content/shapes.ts`): one content-hashed JSON per floor
 * under public/shapes/ (gitignored, rebuilt by `bun run build` and `bun run dev`), which `next build` copies to
 * out/shapes/. Stale files of earlier builds are removed. Fails on an unknown icon or sculpture id, a duplicate, or
 * a sculpture over its box cap or bounds.
 *
 *   bun scripts/build-shapes.ts
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { SHAPE_FLOORS, SHAPES_DIR, shapeFiles } from "@/content/shapes";

export const OUT_DIR = path.join(process.cwd(), "public", SHAPES_DIR);

/** Writes every floor's file into `dir` and removes any other file there; returns the names written. */
export function writeShapes(dir = OUT_DIR): string[] {
  const files = shapeFiles();
  mkdirSync(dir, { recursive: true });
  const names = SHAPE_FLOORS.map((f) => files[f].name);
  if (existsSync(dir)) for (const old of readdirSync(dir)) if (!names.includes(old)) rmSync(path.join(dir, old));
  for (const f of SHAPE_FLOORS) writeFileSync(path.join(dir, files[f].name), files[f].json);
  return names;
}

if (import.meta.main) {
  const files = shapeFiles();
  const names = writeShapes();
  const sizes = SHAPE_FLOORS.map((f) => `${f} ${(files[f].json.length / 1024).toFixed(1)} KB`).join(", ");
  console.log(`build-shapes: ${names.join(", ")} (${sizes})`);
}
