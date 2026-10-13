import { afterEach, describe, expect, it, vi } from "vitest";
import { afterFirstFrameIdle, hasFirstFrame, markFirstFrame, resetFirstFrame, type IdleScheduler } from "@/experience/boot-signals";

const manualIdle = () => {
  const queue: (() => void)[] = [];
  const idle: IdleScheduler = (cb) => {
    queue.push(cb);
    return () => queue.splice(queue.indexOf(cb), 1);
  };
  return { idle, flush: () => queue.splice(0).forEach((cb) => cb()), size: () => queue.length };
};

afterEach(() => resetFirstFrame());

describe("boot signals", () => {
  it("waits for the first frame, then for idle", () => {
    const { idle, flush, size } = manualIdle();
    const cb = vi.fn();
    afterFirstFrameIdle(cb, { idle });
    expect(size()).toBe(0);
    markFirstFrame();
    expect(hasFirstFrame()).toBe(true);
    expect(cb).not.toHaveBeenCalled();
    flush();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("schedules at once when the frame already happened", () => {
    const { idle, flush } = manualIdle();
    markFirstFrame();
    const cb = vi.fn();
    afterFirstFrameIdle(cb, { idle });
    flush();
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("cancels before and after the frame", () => {
    const { idle, flush } = manualIdle();
    const early = vi.fn();
    afterFirstFrameIdle(early, { idle })();
    markFirstFrame();
    const late = vi.fn();
    const cancel = afterFirstFrameIdle(late, { idle });
    cancel();
    flush();
    expect(early).not.toHaveBeenCalled();
    expect(late).not.toHaveBeenCalled();
  });

  it("marks once and resets for the next Experience mount", () => {
    markFirstFrame();
    markFirstFrame();
    resetFirstFrame();
    expect(hasFirstFrame()).toBe(false);
  });
});
