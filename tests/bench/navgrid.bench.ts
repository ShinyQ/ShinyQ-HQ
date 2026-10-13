import { test } from "vitest";
import type { FloorId } from "@/content/schema";
import { ROVER } from "@/experience/config";
import { roadZAt } from "@/experience/floors/career/layout";
import { buildNavGrid, componentsOf, findPath } from "@/experience/nav/navgrid";
import { buildRoadGraph } from "@/experience/nav/road";
import { roadRoute } from "@/experience/nav/roadRoute";
import type { Vec2 } from "@/experience/types";
import * as legacy from "../helpers/navgrid-legacy";
import { farthestWalkable, realLayouts } from "../helpers/real-layouts";

/** Perf report SP11: findPath on the real layouts; pass when every `current` mean is at most 2 ms (8 ms at 4x CPU). */
const layouts = realLayouts();
const TIMEOUT = 60_000;

for (const id of Object.keys(layouts) as FloorId[]) {
  const layout = layouts[id];
  const grid = buildNavGrid(layout, ROVER.radius);
  componentsOf(grid);
  const from = layout.approach;
  const far = farthestWalkable(grid, from);
  test(`${id} findPath, ${grid.cols}x${grid.rows} cells: elevator approach to the farthest cell`, async ({ bench }) => {
    await bench.compare(
      bench("current", () => {
        findPath(grid, from, far);
      }),
      bench("legacy", () => {
        legacy.findPath(grid, from, far);
      }),
    );
  }, TIMEOUT);
  if (layout.obstacles.length) {
    const largest = layout.obstacles.reduce((a, b) => ((b.maxX - b.minX) * (b.maxZ - b.minZ) > (a.maxX - a.minX) * (a.maxZ - a.minZ) ? b : a));
    const inside: Vec2 = { x: (largest.minX + largest.maxX) / 2, z: (largest.minZ + largest.maxZ) / 2 };
    test(`${id} findPath: to the center of the largest obstacle (snapped)`, async ({ bench }) => {
      await bench.compare(
        bench("current", () => {
          findPath(grid, from, inside);
        }),
        bench("legacy", () => {
          legacy.findPath(grid, from, inside);
        }),
      );
    }, TIMEOUT);
  }
  if (layout.scrubStops?.length) {
    const x = layout.scrubStops[Math.min(2, layout.scrubStops.length - 1)];
    const stop: Vec2 = { x, z: roadZAt(layout.road?.roads[0]?.points ?? [], x) };
    test(`${id} findPath: one swipe to a year stop (Director scrub)`, async ({ bench }) => {
      await bench.compare(
        bench("current", () => {
          findPath(grid, from, stop);
        }),
        bench("legacy", () => {
          legacy.findPath(grid, from, stop);
        }),
      );
    }, TIMEOUT);
  }
  if (layout.road) {
    const road = layout.road;
    const graph = buildRoadGraph(road);
    test(`${id} roadRoute: elevator approach to the farthest cell`, async ({ bench }) => {
      await bench("current", () => {
        roadRoute(road, grid, from, far, graph);
      }).run();
    }, TIMEOUT);
  }
}
