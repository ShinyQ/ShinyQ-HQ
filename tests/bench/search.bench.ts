import { test } from "vitest";
import { getContent } from "@/content/load";
import { buildHudIndex } from "@/hud/index-data";
import { buildPaletteEntries, searchPalette } from "@/hud/search";
import * as legacy from "../helpers/search-legacy";

/** Perf report SP11: one search per keystroke while typing a three-word query. Pass: current at most 4 ms per key (16 ms at 4x CPU). */
const entries = buildPaletteEntries(buildHudIndex(getContent()), ["view-cv", "copy-email", "toggle-language", "quick-view"]);
const typed = "voice ai contact center";
const keys = Array.from({ length: typed.length }, (_, i) => typed.slice(0, i + 1));

test(`palette: typing "${typed}" (${keys.length} searches per iteration)`, async ({ bench }) => {
  await bench.compare(
    bench("current", () => {
      for (const q of keys) searchPalette(entries, q, { ask: true });
    }),
    bench("legacy", () => {
      for (const q of keys) legacy.searchPalette(entries, q, { ask: true });
    }),
  );
}, 60_000);
