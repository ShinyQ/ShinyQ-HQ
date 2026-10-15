import type { ComponentType } from "react";
import { describe, expect, it } from "vitest";
import { createFloorChunks, type LazyFloor } from "@/experience/floors/floorChunks";
import { floorGetters } from "@/experience/floors/lazyFloors";

/** The getters in lazyFloors.tsx with an injected floor chunk source (fake modules, controlled imports). */
type Mod = { Floor: ComponentType<{ n: number }> };
type Mods = Record<LazyFloor, Mod>;

const LAZY = Symbol.for("react.lazy");
const isLazy = (c: unknown) => (c as { $$typeof?: symbol } | null)?.$$typeof === LAZY;

function setup() {
  const imports: { resolve: (m: Mod) => void; reject: (e: unknown) => void }[] = [];
  const load = () => new Promise<Mod>((resolve, reject) => imports.push({ resolve, reject }));
  const chunks = createFloorChunks<Mods>({ L3: load, L4: load, RF: load });
  const getter = floorGetters<Mods>(chunks)("L4", (m) => m.Floor);
  const mod: Mod = { Floor: () => null };
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { chunks, getter, mod, imports, settle };
}

/** Runs a React.lazy wrapper's factory the way React does on its first render. */
function initLazy(wrapper: unknown): Promise<unknown> {
  const w = wrapper as { _init: (p: unknown) => unknown; _payload: unknown };
  try {
    w._init(w._payload);
  } catch (thenable) {
    return Promise.resolve(thenable as PromiseLike<unknown>).then(() => w._init(w._payload)).catch((e: unknown) => e);
  }
  return Promise.resolve();
}

describe("lazy floor getters", () => {
  it("return null while the chunk is idle or loading, then the module's own component (never React.lazy)", async () => {
    const { chunks, getter, mod, imports, settle } = setup();
    expect(getter()).toBeNull();
    void chunks.load("L4");
    expect(getter()).toBeNull();
    imports[0].resolve(mod);
    await settle();
    expect(getter()).toBe(mod.Floor);
    expect(isLazy(getter())).toBe(false);
  });

  it("return a React.lazy wrapper only after a failure, and keep it once in use (no lazy to direct remount)", async () => {
    const { chunks, getter, mod, imports, settle } = setup();
    void chunks.load("L4").catch(() => undefined);
    imports[0].reject(new Error("offline"));
    await settle();
    const wrapper = getter();
    expect(isLazy(wrapper)).toBe(true);
    expect(getter()).toBe(wrapper);
    // The wrapper's own import (a retry) succeeds: the floor stays on the wrapper React already rendered.
    const done = initLazy(wrapper);
    expect(imports).toHaveLength(2);
    imports[1].resolve(mod);
    await done;
    expect(chunks.module("L4")).toBe(mod);
    expect(getter()).toBe(wrapper);
  });

  it("drop the cached wrapper when its import rejects, so the remount after the crash retries", async () => {
    const { chunks, getter, imports, settle } = setup();
    void chunks.load("L4").catch(() => undefined);
    imports[0].reject(new Error("offline"));
    await settle();
    const wrapper = getter();
    const done = initLazy(wrapper);
    imports[1].reject(new Error("still offline"));
    expect(await done).toBeInstanceOf(Error);
    const next = getter();
    expect(isLazy(next)).toBe(true);
    expect(next).not.toBe(wrapper);
  });

  it("render a recovered floor directly when no wrapper was rendered (idle prefetch failed, the ride retry worked)", async () => {
    const { chunks, getter, mod, imports, settle } = setup();
    void chunks.load("L4").catch(() => undefined);
    imports[0].reject(new Error("offline"));
    await settle();
    void chunks.load("L4");
    imports[1].resolve(mod);
    await settle();
    expect(getter()).toBe(mod.Floor);
  });
});
