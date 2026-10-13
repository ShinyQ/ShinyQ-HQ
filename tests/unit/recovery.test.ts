import { afterEach, describe, expect, it, vi } from "vitest";
import { afterFailure, AUTO_RETRIES, manualRetry, RECOVERY_START, settled, whenVisible, type Recovery } from "@/experience/recovery";

function fakeDocument(hidden: boolean) {
  const listeners = new Set<() => void>();
  return {
    hidden,
    addEventListener: (_type: "visibilitychange", listener: () => void) => void listeners.add(listener),
    removeEventListener: (_type: "visibilitychange", listener: () => void) => void listeners.delete(listener),
    fire: () => {
      for (const listener of [...listeners]) listener();
    },
    listeners,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("recovery", () => {
  it("remounts once automatically, then fails to the static page", () => {
    expect(AUTO_RETRIES).toBe(1);
    const first = afterFailure(RECOVERY_START);
    expect(first).toEqual({ failures: 1, status: "retrying" });
    const running = settled(first);
    expect(running).toEqual({ failures: 1, status: "ok" });
    expect(afterFailure(running)).toEqual({ failures: 2, status: "failed" });
  });

  it("counts one crash once while a retry or the static page is already showing", () => {
    const retrying = afterFailure(RECOVERY_START);
    expect(afterFailure(retrying)).toBe(retrying);
    const failed = afterFailure(settled(retrying));
    expect(afterFailure(failed)).toBe(failed);
  });

  it("a manual retry that fails again goes straight back to the static page", () => {
    const failed: Recovery = { failures: 2, status: "failed" };
    const retry = manualRetry(failed);
    expect(retry.status).toBe("retrying");
    expect(afterFailure(settled(retry)).status).toBe("failed");
    expect(afterFailure(settled(manualRetry(RECOVERY_START))).status).toBe("failed");
  });
});

describe("whenVisible", () => {
  it("runs on the next task when the tab is visible and can be cancelled", () => {
    vi.useFakeTimers();
    const doc = fakeDocument(false);
    const run = vi.fn();
    whenVisible(run, doc);
    expect(run).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
    const later = vi.fn();
    whenVisible(later, doc)();
    vi.runAllTimers();
    expect(later).not.toHaveBeenCalled();
  });

  it("waits until the tab is visible again", () => {
    vi.useFakeTimers();
    const doc = fakeDocument(true);
    const run = vi.fn();
    whenVisible(run, doc);
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
    doc.fire();
    vi.runAllTimers();
    expect(run).not.toHaveBeenCalled();
    doc.hidden = false;
    doc.fire();
    vi.runAllTimers();
    expect(run).toHaveBeenCalledTimes(1);
    expect(doc.listeners.size).toBe(0);
  });
});
