import { describe, expect, it, vi } from "vitest";
import { buildRoomViews } from "@/content/room-views";
import type { RoomTopics } from "@/content/room-views/types";
import type { FilterUrlEnv } from "@/experience/floors/filterUrl";
import { techFromHash } from "@/experience/floors/labs/techHash";
import { gateStartRoom } from "@/experience/floors/lobby/stations";
import { TOPICS_ROOM, topicFromHash, topicHash } from "@/experience/floors/library/topicHash";
import { createTopicHashSync } from "@/experience/floors/library/topicUrl";
import { createHQStore } from "@/store/useHQStore";

const topics = buildRoomViews("en")["L4:topics"].topics;

function setup(hash = "", floor: "L1" | "L3" | "L4" = "L4") {
  const store = createHQStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined });
  store.getState().resume(floor);
  const location = { pathname: "/en/library", search: "?tier=lite", hash };
  const history = {
    state: { hqRoom: null },
    replaceState: vi.fn((_: unknown, __: string, url: string) => {
      const i = url.indexOf("#");
      location.hash = i >= 0 ? url.slice(i) : "";
    }),
  };
  const env: FilterUrlEnv<RoomTopics> = { history, location, load: async () => topics, defer: (fn) => fn() };
  const dispose = createTopicHashSync({ store, env });
  return { store, location, history, dispose };
}

const voice = { slug: "voice-ai", name: "Voice AI", count: 1, rooms: ["L4:making-a-voice-agent-interruptible" as const] };

describe("Topic Constellation hash", () => {
  it("reads and writes #library-topic=<slug> only", () => {
    expect(topicFromHash("#library-topic=ui-ux")).toBe("ui-ux");
    expect(topicFromHash("#labs-tech=ui-ux")).toBeNull();
    expect(techFromHash("#library-topic=ui-ux")).toBeNull();
    expect(topicHash("ui-ux")).toBe("#library-topic=ui-ux");
  });

  it("writes and clears the hash on L4, keeping path and query", () => {
    const { store, location, history } = setup();
    store.getState().selectTopic(voice);
    expect(history.replaceState).toHaveBeenLastCalledWith({ hqRoom: null }, "", "/en/library?tier=lite#library-topic=voice-ai");
    store.getState().clearTopic();
    expect(location.hash).toBe("");
  });

  it("drops it off L4 and never touches another floor's hash", () => {
    const { store, location } = setup();
    store.getState().selectTopic(voice);
    store.getState().arriveFloor("L3");
    expect(location.hash).toBe("");
    location.hash = "#labs-tech=fastapi";
    store.getState().arriveFloor("L4");
    expect(location.hash).toBe("#labs-tech=fastapi");
  });

  it("picks the topic from the hash on load, once the drawer data arrives", async () => {
    const { store } = setup("#library-topic=sentiment-analysis");
    await vi.waitFor(() => expect(store.getState().topics.topic?.slug).toBe("sentiment-analysis"));
    expect(store.getState().topics.topic).toMatchObject({ name: "Sentiment analysis", rooms: ["L4:research", "L4:publications"] });
  });

  it("ignores an unknown slug", async () => {
    const { store } = setup("#library-topic=not-a-topic");
    await new Promise((r) => setTimeout(r, 0));
    expect(store.getState().topics.topic).toBeNull();
  });

  it("starts the gate on the constellation for a topic hash on /library only", () => {
    expect(gateStartRoom("L4", undefined, "#library-topic=voice-ai")).toBe(TOPICS_ROOM);
    expect(gateStartRoom("L4", undefined, "#labs-tech=fastapi")).toBeUndefined();
    expect(gateStartRoom("L3", undefined, "#library-topic=voice-ai")).toBeUndefined();
    expect(gateStartRoom(undefined, undefined, "#library-topic=voice-ai")).toBeUndefined();
  });
});
