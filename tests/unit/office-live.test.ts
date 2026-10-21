// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { OFFICE_PATH } from "@/lib/office/protocol";
import { statesA } from "../../e2e/office-fixtures";

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<{ status: number; json: () => Promise<unknown> }>>(async () => ({ status: 200, json: async () => statesA(Date.now()) }));
vi.stubGlobal("fetch", fetchMock);

const { officeLive, officePollInterval, officeTest } = await import("@/experience/floors/lobby/office/live");
const { POLL } = await import("@/lib/office/poll");
const { officeRuntime, setChipFar, setChipsCompact, subscribeChipFar } = await import("@/experience/floors/lobby/office/runtime");
const { OFFICE_CHIP_ANCHORS } = await import("@/experience/floors/lobby/officeShell");

/** A live module with a poller that never fetched (its first start fetches at once). */
async function freshLive() {
  vi.resetModules();
  return import("@/experience/floors/lobby/office/live");
}

afterEach(() => {
  officeLive.view(null);
  officeLive.want("drawer", false);
  fetchMock.mockClear();
});

describe("Agent Office live feed (3D)", () => {
  it("polls snapshot v3 while any reason wants it (in view near or far, a drawer open) and stops when none does", async () => {
    officeLive.want("near", true);
    officeLive.want("drawer", true);
    expect(officeLive.wanted()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(`${OFFICE_PATH}?v=3`);
    await vi.waitFor(() => expect(officeTest.feed().status).toBe("ready"));
    // The fixture is a v1 body (as after a rollback): it reads as a v3 snapshot.
    expect(officeTest.feed().snapshot?.v).toBe(3);
    officeLive.want("near", false);
    expect(officeLive.wanted()).toBe(true);
    officeLive.want("drawer", false);
    expect(officeLive.wanted()).toBe(false);
  });

  it("polls fast near or with a drawer open, every 30 s far, and stops out of view (the office watch takes over)", async () => {
    const live = (states: readonly ("near" | "far" | "drawer")[]) => new Set(states);
    const awake = { status: "ready", snapshot: statesA(Date.now()), fetchedAt: 0 } as const;
    expect(officePollInterval(live(["near"]), awake)).toBe(POLL.activeMs);
    expect(officePollInterval(live(["drawer"]), awake)).toBe(POLL.activeMs);
    expect(officePollInterval(live(["far", "drawer"]), awake)).toBe(POLL.activeMs);
    expect(officePollInterval(live(["far"]), awake)).toBe(POLL.restingMs);
    // Near with every desk asleep (or no snapshot) rests at 30 s like the far poll.
    expect(officePollInterval(live(["near"]), { status: "idle", snapshot: null, fetchedAt: 0 })).toBe(POLL.restingMs);
    const { officeLive: live2 } = await freshLive();
    vi.useFakeTimers();
    try {
      live2.view("near");
      expect(live2.reasons()).toEqual(["near"]);
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(POLL.activeMs);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // Far: the switch re-arms the wait (no restart, no fetch at once), 30 s after the last request.
      live2.view("far");
      expect(live2.reasons()).toEqual(["far"]);
      await vi.advanceTimersByTimeAsync(POLL.activeMs);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(POLL.restingMs - POLL.activeMs);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      // A drawer brings the fast cadence back while far.
      live2.want("drawer", true);
      await vi.advanceTimersByTimeAsync(POLL.activeMs);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      live2.want("drawer", false);
      // Back near after 25 s far: already past the fast wait, so it fetches at once.
      await vi.advanceTimersByTimeAsync(POLL.restingMs - 5_000);
      expect(fetchMock).toHaveBeenCalledTimes(4);
      live2.view("near");
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(5);
      // Out of view: the scene's poller stops.
      live2.view(null);
      expect(live2.wanted()).toBe(false);
      await vi.advanceTimersByTimeAsync(3 * POLL.restingMs);
      expect(fetchMock).toHaveBeenCalledTimes(5);
    } finally {
      live2.view(null);
      live2.want("drawer", false);
      vi.useRealTimers();
    }
  });

  it("a re-entry into view waits out the rest of the cadence since the last request (no fetch per frustum crossing)", async () => {
    const { officeLive: live2 } = await freshLive();
    vi.useFakeTimers();
    try {
      live2.view("far");
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // Far: out and back in within 30 s never fetches; the next request comes 30 s after the last one.
      for (let s = 0; s < 10; s++) {
        await vi.advanceTimersByTimeAsync(1_000);
        live2.view(null);
        await vi.advanceTimersByTimeAsync(500);
        live2.view("far");
      }
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(POLL.restingMs - 15_000 - 1);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      // Near (awake desks, the 10 s cadence): a re-entry 4 s after the request waits the other 6 s.
      live2.view("near");
      await vi.advanceTimersByTimeAsync(POLL.activeMs);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(3_000);
      live2.view(null);
      await vi.advanceTimersByTimeAsync(1_000);
      live2.view("near");
      await vi.advanceTimersByTimeAsync(0);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(POLL.activeMs - 4_000 - 1);
      expect(fetchMock).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      live2.view(null);
      vi.useRealTimers();
    }
  });

  it("fetches again at once when the tab turns visible while wanted, and not when unwanted", async () => {
    const { officeLive: live2 } = await freshLive();
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    live2.want("near", true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    live2.want("near", false);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(fetchMock).toHaveBeenCalledTimes(2);
    visibility.mockRestore();
  });

  it("fetches at once for the test hook without starting the poller, and skews its clock", async () => {
    officeTest.poll();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(officeTest.wanted()).toBe(false);
    officeTest.advance(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("counts every settled fetch (a kept snapshot included) for the test hook", async () => {
    vi.resetModules();
    const fresh = await import("@/experience/floors/lobby/office/live");
    expect(fresh.officeTest.settled()).toBe(0);
    fresh.officeTest.poll();
    expect(fresh.officeTest.settled()).toBe(0);
    await vi.waitFor(() => expect(fresh.officeTest.settled()).toBe(1));
    fetchMock.mockResolvedValueOnce({ status: 204, json: async () => null });
    fresh.officeTest.poll();
    await vi.waitFor(() => expect(fresh.officeTest.settled()).toBe(2));
    expect(fresh.officeTest.feed().status).toBe("ready");
  });

  it("lets the test hook's fetch land while nothing wants the poller, then stops it", async () => {
    vi.resetModules();
    const fresh = await import("@/experience/floors/lobby/office/live");
    expect(fresh.officeTest.feed().status).toBe("idle");
    fresh.officeTest.poll();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fresh.officeTest.feed().status).toBe("loading");
    await vi.waitFor(() => expect(fresh.officeTest.feed().status).toBe("ready"));
    expect(fresh.officeTest.wanted()).toBe(false);
    // start() is idempotent, so a fetch at once on the next want (past the cadence) proves the hook stopped the poller
    // after its feed landed.
    vi.useFakeTimers({ now: Date.now() + POLL.restingMs });
    try {
      fresh.officeLive.want("near", true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      fresh.officeLive.want("near", false);
      vi.useRealTimers();
    }
  });

  it("anchors a chip over every Rover, starts every chip far and notifies far and compact changes once", () => {
    // One anchor per seat (both rows); the runtime's chips cover the five Rovers the scene draws.
    expect(OFFICE_CHIP_ANCHORS).toHaveLength(10);
    expect(officeRuntime.chips).toEqual([null, null, null, null, null]);
    expect(officeRuntime.chipFar).toEqual([true, true, true, true, true]);
    expect(officeRuntime.compact).toBe(false);
    const listener = vi.fn();
    const unsubscribe = subscribeChipFar(listener);
    setChipFar(2, false);
    setChipFar(2, false);
    expect(officeRuntime.chipFar[2]).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
    setChipFar(2, true);
    expect(listener).toHaveBeenCalledTimes(2);
    setChipsCompact(true);
    setChipsCompact(true);
    expect(officeRuntime.compact).toBe(true);
    expect(listener).toHaveBeenCalledTimes(3);
    unsubscribe();
    setChipFar(2, false);
    setChipsCompact(false);
    expect(listener).toHaveBeenCalledTimes(3);
    setChipFar(2, true);
  });
});
