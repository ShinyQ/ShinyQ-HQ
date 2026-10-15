import type { Object3D, Scene } from "three";

/** Whether `object` and every ancestor are visible, so the next render draws it (frustum aside). */
export function shownInScene(object: Object3D): boolean {
  for (let o: Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

const pending = new Map<Object3D, () => void>();

/**
 * Per-frame work whose only effect is how `object` looks when drawn, such as the instance matrices of
 * a mesh on a floor whose content FloorLevel hides. Runs `work` now when `object` is shown. Otherwise
 * it waits for the next scene render, which runs it first if `object` is shown by then. That covers a
 * floor that turns visible later in the same frame: `useFrame` callbacks of a floor's content can run
 * before FloorLevel's visibility update. So a drawn frame never shows stale data, and a hidden one
 * skips the work. The latest call per object wins.
 */
export function whenDrawn(object: Object3D, work: () => void): void {
  if (shownInScene(object)) {
    pending.delete(object);
    work();
  } else {
    pending.set(object, work);
  }
}

/** Drops waiting work for `object` (call when it unmounts). */
export function forgetDrawn(object: Object3D): void {
  pending.delete(object);
}

/** Runs the waiting work of every object that is shown now. Exported for tests. */
export function flushDrawn(): void {
  if (!pending.size) return;
  for (const [object, work] of pending) {
    if (!shownInScene(object)) continue;
    pending.delete(object);
    work();
  }
}

/**
 * Wraps the scene's `onBeforeRender`: waiting work runs before anything else in it (the ride cull
 * included), so it lands before three uploads instance buffers for this render. Returns the uninstall.
 */
export function installDrawnWork(scene: Scene): () => void {
  const before = scene.onBeforeRender;
  scene.onBeforeRender = function (this: Scene, ...args: Parameters<Scene["onBeforeRender"]>) {
    flushDrawn();
    before.apply(this, args);
  };
  return () => {
    pending.clear();
    scene.onBeforeRender = before;
  };
}
