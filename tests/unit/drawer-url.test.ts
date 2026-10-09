import { beforeEach, describe, expect, it } from "vitest";
import type { StateStorage } from "zustand/middleware";
import { createRoomUrlSync, withView, type UrlEnv } from "@/hud/drawer/urlSync";
import { createHQStore, type HQStore } from "@/store/useHQStore";

const memory = (): StateStorage => {
  const data = new Map<string, string>();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
};

function fakeEnv(start: string) {
  const entries: { url: string; state: unknown }[] = [{ url: start, state: null }];
  let index = 0;
  let pop: (() => void) | null = null;
  const location = { pathname: "", search: "" };
  const sync = () => {
    const url = new URL(entries[index].url, "http://x");
    location.pathname = url.pathname;
    location.search = url.search;
  };
  sync();
  const env: UrlEnv = {
    history: {
      get state() {
        return entries[index].state;
      },
      pushState(state: unknown, _: string, url?: string | URL | null) {
        entries.splice(index + 1);
        entries.push({ url: String(url), state });
        index++;
        sync();
      },
      replaceState(state: unknown, _: string, url?: string | URL | null) {
        entries[index] = { url: String(url), state };
        sync();
      },
    } as UrlEnv["history"],
    location,
    onPopState: (listener) => {
      pop = listener;
      return () => (pop = null);
    },
  };
  const go = (delta: number) => {
    index += delta;
    sync();
    pop?.();
  };
  return { env, entries, go, url: () => `${location.pathname}${location.search}` };
}

let store: HQStore;
beforeEach(() => {
  store = createHQStore(memory());
  store.getState().resume("L3");
});

describe("room URL sync", () => {
  it("keeps other query params and toggles view=architecture", () => {
    expect(withView("/en/labs/a", "?tier=lite", "architecture")).toBe("/en/labs/a?tier=lite&view=architecture");
    expect(withView("/en/labs/a", "?view=architecture&tier=lite", null)).toBe("/en/labs/a?tier=lite");
    expect(withView("/en", "", null)).toBe("/en");
  });

  it("pushes on open, replaces on room switch and hologram, replaces with the floor URL on close", () => {
    const h = fakeEnv("/en/labs?tier=lite");
    const off = createRoomUrlSync({ store, locale: "en", env: h.env, isReady: () => true });
    store.getState().openRoom("L3:voice-ai");
    expect(h.url()).toBe("/en/labs/voice-ai?tier=lite");
    expect(h.entries).toHaveLength(2);
    store.getState().openRoom("L3:fraud");
    expect(h.url()).toBe("/en/labs/fraud?tier=lite");
    expect(h.entries).toHaveLength(2);
    store.getState().openHologram();
    expect(h.url()).toBe("/en/labs/fraud?tier=lite&view=architecture");
    store.getState().closeHologram();
    expect(h.url()).toBe("/en/labs/fraud?tier=lite");
    store.getState().closeRoom();
    expect(h.url()).toBe("/en/labs?tier=lite");
    off();
  });

  it("reopens and closes rooms on back and forward without writing history", () => {
    const h = fakeEnv("/en/labs");
    createRoomUrlSync({ store, locale: "en", env: h.env, isReady: () => true });
    store.getState().openRoom("L3:voice-ai");
    h.go(-1);
    expect(store.getState().activeRoom).toBeNull();
    expect(store.getState().phase).toBe("explore");
    h.go(1);
    expect(store.getState().activeRoom).toBe("L3:voice-ai");
    expect(h.entries).toHaveLength(2);
  });

  it("restores the hologram view from the URL", () => {
    const h = fakeEnv("/en/labs");
    createRoomUrlSync({ store, locale: "en", env: h.env, isReady: () => true });
    store.getState().openRoom("L3:voice-ai");
    store.getState().openHologram();
    store.getState().closeHologram();
    h.env.history.pushState(null, "", "/en/labs/voice-ai?view=architecture");
    h.go(-1);
    h.go(1);
    expect(store.getState().phase).toBe("hologram");
  });

  it("uses the Lobby URL for rooms on floors without 3D content", () => {
    const h = fakeEnv("/en");
    store.getState().resume("L1");
    createRoomUrlSync({ store, locale: "en", env: h.env, isReady: (f) => f === "L1" });
    store.getState().openRoom("L1:skills");
    expect(h.url()).toBe("/en");
    store.getState().closeRoom();
    expect(h.url()).toBe("/en");
  });
});
