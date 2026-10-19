import { describe, expect, it, vi } from "vitest";
import type { AudioEngineDeps } from "@/lib/audio";
import { createAudioEngine } from "@/lib/audio/engine";
import { QUEUED_SOUND_MAX_AGE_MS, createAudioFacade } from "@/lib/audio/singleton";
import { FakeAudioContext } from "../helpers/fake-audio";

/**
 * The `audio` facade keeps the engine (engine.ts, synth.ts, music.ts) out of every page's JS: the chunk loads
 * only when the 3D view needs sound. What callers set before it arrives is persisted or remembered and handed
 * to the engine when it does.
 */

class FakeStorage {
  map = new Map<string, string>();
  getItem = (key: string) => this.map.get(key) ?? null;
  setItem = (key: string, value: string) => {
    this.map.set(key, value);
  };
}

class FakeDoc {
  visibilityState: DocumentVisibilityState = "visible";
  handlers = new Map<string, Set<() => void>>();
  addEventListener = (type: string, handler: () => void) => {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
  };
  removeEventListener = (type: string, handler: () => void) => {
    this.handlers.get(type)?.delete(handler);
  };
  count(type: string) {
    return this.handlers.get(type)?.size ?? 0;
  }
  fire(type: string) {
    for (const handler of [...(this.handlers.get(type) ?? [])]) handler();
  }
}

function setup({ activation = false } = {}) {
  const user = { active: activation };
  const clock = { t: 0 };
  const storage = new FakeStorage();
  const doc = new FakeDoc();
  const contexts: FakeAudioContext[] = [];
  const createContext = vi.fn(() => {
    const ctx = new FakeAudioContext();
    contexts.push(ctx);
    return ctx as unknown as AudioContext;
  });
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const load = vi.fn(() => gate.then(() => ({ createAudioEngine })));
  const facade = createAudioFacade({
    load,
    hasActivation: () => user.active,
    deps: { storage, doc: doc as unknown as AudioEngineDeps["doc"], createContext, now: () => clock.t, loadAmbience: () => new Promise(() => {}) },
  });
  const arrive = async () => {
    release();
    await gate;
    await Promise.resolve();
  };
  /** A user gesture: the browser grants the activation, then the event reaches the listeners. */
  const gesture = (type: string) => {
    user.active = true;
    doc.fire(type);
  };
  return { facade, storage, doc, load, createContext, contexts, arrive, clock, gesture };
}

describe("audio facade (lazy engine)", () => {
  it("never loads the engine on the Page View (paused), whatever is played or clicked", () => {
    const { facade, doc, load } = setup({ activation: true });
    facade.play("click");
    facade.toggleMuted();
    facade.setEffects(false);
    doc.fire("pointerdown");
    doc.fire("keydown");
    expect(load).not.toHaveBeenCalled();
    expect(facade.playCounts()).toEqual({ click: 1 });
    expect(facade.isMuted()).toBe(true);
    expect(facade.getSettings().effects).toBe(false);
  });

  it("answers from storage and persists mute and settings before the engine exists", () => {
    const { facade, storage } = setup();
    storage.map.set("hq:sound", "off");
    storage.map.set("hq:music-volume", "0.4");
    const listener = vi.fn();
    facade.subscribe(listener);
    expect(facade.isMuted()).toBe(true);
    expect(facade.getSettings()).toEqual({ effects: true, music: true, musicVolume: 0.4, ambience: true });
    const snapshot = facade.getSettings();
    expect(facade.getSettings()).toBe(snapshot);
    facade.setMuted(false);
    facade.setAmbience(false);
    facade.setMusicVolume(3);
    facade.setAmbience(false);
    expect(storage.map.get("hq:sound")).toBe("on");
    expect(storage.map.get("hq:ambience")).toBe("off");
    expect(storage.map.get("hq:music-volume")).toBe("1");
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("loads on the first one-shot after an activation in the 3D view, and hands over what was set while it loaded", async () => {
    const { facade, load, storage, createContext, arrive } = setup({ activation: true });
    const listener = vi.fn();
    facade.subscribe(listener);
    facade.setPaused(false);
    facade.setFloor("L3");
    facade.setRumble(0);
    // Nothing needs sound yet (an idle rover, a floor): no download.
    expect(load).not.toHaveBeenCalled();
    facade.setMuted(false);
    facade.play("beep");
    expect(load).toHaveBeenCalledTimes(1);
    facade.setEffects(false);
    facade.setEffects(true);
    expect(storage.map.get("hq:sound")).toBe("on");
    await arrive();
    expect(facade.isPaused()).toBe(false);
    expect(facade.isMuted()).toBe(false);
    expect(facade.ambienceFloor()).toBe("L3");
    // The queued beep plays when the engine arrives (it creates the context and starts the music).
    expect(createContext).toHaveBeenCalledTimes(1);
    facade.play("beep");
    facade.play("ding");
    // Counted once each, before and after the load (a probe for e2e: `window.__hq.audio().played`).
    expect(facade.playCounts()).toEqual({ beep: 2, ding: 1 });
    // Engine changes reach the facade's subscribers.
    listener.mockClear();
    facade.toggleMuted();
    expect(facade.isMuted()).toBe(true);
    expect(listener).toHaveBeenCalled();
    expect(storage.map.get("hq:sound")).toBe("off");
  });

  it("a moving rover loads it after an activation; mute set while it loads is applied", async () => {
    const { facade, load, arrive } = setup({ activation: true });
    facade.setPaused(false);
    facade.setRumble(6);
    expect(load).toHaveBeenCalledTimes(1);
    facade.setMuted(true);
    await arrive();
    expect(facade.isMuted()).toBe(true);
  });

  it("a gesture before a late chunk: the one context starts inside the gesture, and the engine adopts it", async () => {
    const { facade, load, createContext, contexts, arrive, clock, gesture } = setup();
    facade.setPaused(false);
    expect(load).not.toHaveBeenCalled();
    // The Boot tap: the download starts and the context is created and resumed inside the gesture (Safari).
    gesture("pointerdown");
    expect(load).toHaveBeenCalledTimes(1);
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(contexts[0].resume).toHaveBeenCalledTimes(1);
    expect(contexts[0].state).toBe("running");
    // The tap's own sound, requested while the chunk is still on its way.
    facade.play("beep");
    gesture("click");
    expect(createContext).toHaveBeenCalledTimes(1);
    // The chunk arrives late, outside any gesture.
    clock.t = QUEUED_SOUND_MAX_AGE_MS - 100;
    await arrive();
    expect(createContext).toHaveBeenCalledTimes(1);
    const ctx = contexts[0];
    expect(ctx.state).toBe("running");
    // The music started (three triangle drones) and the queued beep played (square tones).
    expect(ctx.oscillators.filter((o) => o.type === "triangle").length).toBeGreaterThanOrEqual(3);
    expect(ctx.oscillators.some((o) => o.type === "square")).toBe(true);
    expect(facade.playCounts()).toEqual({ beep: 1 });
    // Later sounds go straight to the engine on the same context.
    facade.play("ding");
    expect(createContext).toHaveBeenCalledTimes(1);
  });

  it("drops a queued one-shot older than QUEUED_SOUND_MAX_AGE_MS, but the music still starts", async () => {
    const { facade, contexts, arrive, clock, gesture } = setup();
    facade.setPaused(false);
    gesture("touchend");
    facade.play("beep");
    clock.t = QUEUED_SOUND_MAX_AGE_MS + 1;
    await arrive();
    const ctx = contexts[0];
    expect(ctx.oscillators.some((o) => o.type === "square")).toBe(false);
    expect(ctx.oscillators.filter((o) => o.type === "triangle").length).toBeGreaterThanOrEqual(3);
    expect(facade.playCounts()).toEqual({ beep: 1 });
  });

  it("an unmute before the engine arrives starts the context inside that click", async () => {
    const { facade, storage, createContext, contexts, arrive, gesture } = setup();
    storage.map.set("hq:sound", "off");
    facade.setPaused(false);
    // Muted: the press downloads the engine but makes no context.
    gesture("pointerdown");
    expect(createContext).not.toHaveBeenCalled();
    facade.setMuted(false);
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(contexts[0].resume).toHaveBeenCalled();
    await arrive();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(facade.isMuted()).toBe(false);
    expect(contexts[0].oscillators.filter((o) => o.type === "triangle").length).toBeGreaterThanOrEqual(3);
  });

  it("pausing before the engine arrives suspends the early context; the engine adopts it silent", async () => {
    const { facade, createContext, contexts, arrive, gesture } = setup();
    facade.setPaused(false);
    gesture("pointerdown");
    facade.setPaused(true);
    expect(contexts[0].suspend).toHaveBeenCalled();
    await arrive();
    expect(createContext).toHaveBeenCalledTimes(1);
    expect(contexts[0].oscillators).toHaveLength(0);
  });

  it("dispose closes a context the facade still holds alone", () => {
    const { facade, contexts, gesture } = setup();
    facade.setPaused(false);
    gesture("keydown");
    facade.dispose();
    expect(contexts[0].close).toHaveBeenCalled();
  });

  it("stops waiting for a gesture when the 3D view pauses again before one came", () => {
    const { facade, doc, load } = setup();
    facade.setPaused(false);
    facade.setPaused(true);
    doc.fire("keydown");
    expect(load).not.toHaveBeenCalled();
  });

  it("does not load for sounds before any activation (they could not be heard)", () => {
    const { facade, load } = setup();
    facade.setPaused(false);
    facade.play("whoosh");
    facade.setRumble(9);
    expect(load).not.toHaveBeenCalled();
    expect(facade.playCounts()).toEqual({ whoosh: 1 });
  });
});
