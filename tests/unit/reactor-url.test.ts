import { describe, expect, it, vi } from "vitest";
import { buildRoomViews } from "@/content/room-views";
import { createReactorHashSync, type ReactorUrlEnv } from "@/experience/floors/labs/reactorUrl";
import { createHQStore } from "@/store/useHQStore";

const reactor = buildRoomViews("en")["L3:reactor"].reactor;

function setup(hash = "", floor: "L1" | "L3" = "L3") {
  const store = createHQStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  store.getState().resume(floor);
  const location = { pathname: "/en/labs", search: "?tier=lite", hash };
  const history = {
    state: { hqRoom: null },
    replaceState: vi.fn((_: unknown, __: string, url: string) => {
      const i = url.indexOf("#");
      location.hash = i >= 0 ? url.slice(i) : "";
    }),
  };
  const env: ReactorUrlEnv = { history, location, load: async () => reactor, defer: (fn) => fn() };
  const dispose = createReactorHashSync({ store, env });
  return { store, location, history, dispose };
}

const azure = { slug: "azure-openai", name: "Azure OpenAI", ring: "ai" as const, count: 1, pods: ["x"] };

describe("Tech Reactor hash", () => {
  it("writes and clears #labs-tech on L3, keeping path and query", () => {
    const { store, location, history } = setup();
    store.getState().selectReactorTech(azure);
    expect(history.replaceState).toHaveBeenLastCalledWith({ hqRoom: null }, "", "/en/labs?tier=lite#labs-tech=azure-openai");
    store.getState().clearReactorTech();
    expect(location.hash).toBe("");
  });

  it("drops it off L3 and restores it on return", () => {
    const { store, location } = setup();
    store.getState().selectReactorTech(azure);
    store.getState().arriveFloor("L2");
    expect(location.hash).toBe("");
    store.getState().arriveFloor("L3");
    expect(location.hash).toBe("#labs-tech=azure-openai");
  });

  it("puts the hash back after a room URL write removed it", () => {
    const { store, location } = setup();
    store.getState().selectReactorTech(azure);
    location.hash = "";
    store.getState().openRoom("L3:reactor");
    expect(location.hash).toBe("#labs-tech=azure-openai");
  });

  it("never touches other hashes, nor writes during the intro", () => {
    const { store, history } = setup("#highlights-about");
    store.getState().selectReactorTech(azure);
    expect(history.replaceState).not.toHaveBeenCalled();
    const second = setup();
    second.store.getState().setPhase("intro");
    second.store.getState().selectReactorTech(azure);
    expect(second.history.replaceState).not.toHaveBeenCalled();
  });

  it("picks the tech of a deep link once the data loads", async () => {
    const { store } = setup("#labs-tech=next-js");
    await vi.waitFor(() => expect(store.getState().reactor.tech?.slug).toBe("next-js"));
    expect(store.getState().reactor.ring).toBe("frontend");
  });

  it("ignores an unknown slug", async () => {
    const { store } = setup("#labs-tech=nope");
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().reactor.tech).toBeNull();
  });
});
