import { afterEach, expect, it } from "vitest";
import { renderProbe } from "@/experience/scene/renderProbe";

afterEach(() => {
  renderProbe.gl = null;
  renderProbe.resetPeak();
});

it("keeps the highest whole-frame counts until reset", () => {
  renderProbe.resetPeak();
  renderProbe.record(90, 8000);
  renderProbe.record(140, 7000);
  renderProbe.record(120, 9000);
  expect(renderProbe).toMatchObject({ peakCalls: 140, peakTriangles: 9000, frames: 3 });
  renderProbe.resetPeak();
  expect(renderProbe).toMatchObject({ peakCalls: 0, peakTriangles: 0, frames: 0 });
});

it("lists programs by material name and a short key hash, sorted", () => {
  renderProbe.gl = { info: { programs: [{ name: "MeshBasicMaterial", cacheKey: "b" }, { name: "LineBasicMaterial", cacheKey: "a" }] } } as never;
  expect(renderProbe.programs()).toBe(2);
  const names = renderProbe.programNames();
  expect(names).toHaveLength(2);
  expect(names[0]).toMatch(/^LineBasicMaterial#[0-9a-z]+$/);
  expect(names[1]).toMatch(/^MeshBasicMaterial#[0-9a-z]+$/);
});

it("reports zero programs without a renderer", () => {
  expect(renderProbe.programs()).toBe(0);
  expect(renderProbe.programNames()).toEqual([]);
});
