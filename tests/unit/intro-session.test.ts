import { afterEach, describe, expect, it } from "vitest";
import { INTRO_KEY, introSeen, lobbyStartPhase, markIntroSeen, type SessionLike } from "@/lib/intro-session";
import { continuationSteps, endContinuation, introTarget, isContinuing, setIntroTarget, takeIntroTarget } from "@/experience/introContinue";

const memory = () => {
  const data = new Map<string, string>();
  const storage: SessionLike = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  return { data, storage };
};
const broken: SessionLike = {
  getItem: () => {
    throw new Error("denied");
  },
  setItem: () => {
    throw new Error("denied");
  },
};

describe("intro session flag", () => {
  it("plays the full boot and intro until they finished once in this session", () => {
    const { data, storage } = memory();
    expect(introSeen(storage)).toBe(false);
    expect(lobbyStartPhase(introSeen(storage))).toBe("boot");
    markIntroSeen(storage);
    expect(data.get(INTRO_KEY)).toBe("seen");
    expect(lobbyStartPhase(introSeen(storage))).toBe("explore");
  });

  it("treats unavailable storage as a new session, so the intro plays", () => {
    expect(introSeen(broken)).toBe(false);
    expect(() => markIntroSeen(broken)).not.toThrow();
    expect(introSeen(null)).toBe(false);
  });
});

describe("intro continuation (deep links play the intro first, then the rover continues)", () => {
  const ready = ["L1", "L2", "L3", "L4", "RF"] as const;
  afterEach(() => {
    takeIntroTarget();
    endContinuation();
  });

  it("targets the deep-linked room on its floor, or the deep-linked floor", () => {
    expect(introTarget({ startFloor: "L3", startRoom: "L3:voice-ai-contact-center", ready })).toEqual({ floor: "L3", room: "L3:voice-ai-contact-center", architecture: false });
    expect(introTarget({ startFloor: "L3", startRoom: "L3:voice-ai-contact-center", ready, architecture: true })).toMatchObject({ architecture: true });
    expect(introTarget({ startFloor: "L2", ready })).toEqual({ floor: "L2" });
  });

  it("prefers the resumed floor of a language switch, keeps its room, and ignores the Lobby or unready floors", () => {
    expect(introTarget({ resumeFloor: "L4", startFloor: "L2", ready })).toEqual({ floor: "L4" });
    expect(introTarget({ resumeFloor: "L2", startRoom: "L2:jenius-2024", ready })).toEqual({ floor: "L2", room: "L2:jenius-2024", architecture: false });
    expect(introTarget({ ready })).toBeNull();
    expect(introTarget({ startFloor: "L1", ready })).toBeNull();
    expect(introTarget({ startFloor: "L4", ready: ["L1", "L2"] })).toBeNull();
    expect(introTarget({ startRoom: "L4:research", ready: ["L1", "L2"] })).toBeNull();
  });

  it("rides, drives and opens a room; rides only for a floor", () => {
    expect(continuationSteps({ floor: "L3", room: "L3:voice-ai-contact-center" })).toEqual([
      { kind: "elevator", floor: "L3" },
      { kind: "drive", to: "L3:voice-ai-contact-center" },
      { kind: "open", room: "L3:voice-ai-contact-center" },
    ]);
    expect(continuationSteps({ floor: "L2" })).toEqual([{ kind: "elevator", floor: "L2" }]);
  });

  it("hands the pending target over once and reports the continuation until it ends", () => {
    expect(isContinuing()).toBe(false);
    setIntroTarget({ floor: "L2" });
    expect(isContinuing()).toBe(true);
    expect(takeIntroTarget()).toEqual({ floor: "L2" });
    expect(isContinuing()).toBe(true);
    expect(takeIntroTarget()).toBeNull();
    endContinuation();
    expect(isContinuing()).toBe(false);
  });
});
