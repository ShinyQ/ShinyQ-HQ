import { afterEach, describe, expect, it, vi } from "vitest";
import { Group, Mesh, Scene, type Camera, type WebGLRenderer } from "three";
import { flushDrawn, forgetDrawn, installDrawnWork, shownInScene, whenDrawn } from "@/experience/scene/drawnWork";

function floor() {
  const scene = new Scene();
  const content = new Group();
  const mesh = new Mesh();
  content.add(mesh);
  scene.add(content);
  return { scene, content, mesh };
}

const render = (scene: Scene) => (scene.onBeforeRender as (...args: unknown[]) => void)({} as WebGLRenderer, scene, {} as Camera, null);

describe("drawnWork", () => {
  let uninstall: (() => void) | undefined;
  afterEach(() => {
    uninstall?.();
    uninstall = undefined;
  });

  it("knows whether an object and its ancestors are visible", () => {
    const { content, mesh } = floor();
    expect(shownInScene(mesh)).toBe(true);
    content.visible = false;
    expect(shownInScene(mesh)).toBe(false);
  });

  it("runs work at once for a shown object", () => {
    const { mesh } = floor();
    const work = vi.fn();
    whenDrawn(mesh, work);
    expect(work).toHaveBeenCalledTimes(1);
  });

  it("holds work for a hidden object and runs the latest call before the render that shows it, once", () => {
    const { scene, content, mesh } = floor();
    uninstall = installDrawnWork(scene);
    content.visible = false;
    const stale = vi.fn();
    const latest = vi.fn();
    whenDrawn(mesh, stale);
    whenDrawn(mesh, latest);
    render(scene);
    expect(latest).not.toHaveBeenCalled();
    // FloorLevel shows the floor later in the same frame, then the scene renders (twice with a composer).
    content.visible = true;
    render(scene);
    render(scene);
    expect(stale).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it("runs before the scene's existing hook (the ride cull) and restores it on uninstall", () => {
    const { scene, content, mesh } = floor();
    const order: string[] = [];
    const existing = () => void order.push("existing");
    scene.onBeforeRender = existing;
    uninstall = installDrawnWork(scene);
    content.visible = false;
    whenDrawn(mesh, () => order.push("work"));
    content.visible = true;
    render(scene);
    expect(order).toEqual(["work", "existing"]);
    uninstall();
    uninstall = undefined;
    expect(scene.onBeforeRender).toBe(existing);
  });

  it("drops work for an unmounted object", () => {
    const { content, mesh } = floor();
    content.visible = false;
    const work = vi.fn();
    whenDrawn(mesh, work);
    forgetDrawn(mesh);
    content.visible = true;
    flushDrawn();
    expect(work).not.toHaveBeenCalled();
  });
});
