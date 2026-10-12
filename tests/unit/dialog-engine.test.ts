import { describe, expect, it, vi } from "vitest";
import { CHAR_MS, CONTINUE_CHOICE, createDialogEngine, linesOf } from "@/hud/dialog/engine";

const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const choices = [
  { id: "yes", label: "Yes" },
  { id: "no", label: "No", cancel: true },
];

describe("linesOf", () => {
  it("accepts a string, a line or a list of both", () => {
    expect(linesOf("Hi")).toEqual([{ text: "Hi" }]);
    expect(linesOf({ text: "Hi", key: "a" })).toEqual([{ text: "Hi", key: "a" }]);
    expect(linesOf(["One", { text: "Two" }])).toEqual([{ text: "One" }, { text: "Two" }]);
  });
});

describe("dialog engine", () => {
  it("types one character per CHAR_MS and reports what it revealed", () => {
    const d = createDialogEngine();
    void d.say("Hello");
    expect(d.view.shown).toBe(0);
    expect(d.tick(CHAR_MS * 2)).toBe(2);
    expect(d.view.shown).toBe(2);
    expect(d.tick(CHAR_MS / 2)).toBe(0);
    expect(d.tick(CHAR_MS * 10)).toBe(3);
    expect(d.view.shown).toBe(5);
  });

  it("completes the line on the first press and advances on the second", async () => {
    const d = createDialogEngine();
    const done = vi.fn();
    void d.say(["First line", "Second"]).then(done);
    d.advance();
    expect(d.view.shown).toBe("First line".length);
    expect(d.view.index).toBe(0);
    d.advance();
    expect(d.view.index).toBe(1);
    d.advance();
    d.advance();
    await flush();
    expect(done).toHaveBeenCalledWith({ status: "done", choice: null });
    expect(d.view.line).toBeNull();
  });

  it("shows whole lines at once in instant mode (reduced motion)", () => {
    const d = createDialogEngine();
    d.setInstant(true);
    void d.say("Hello there");
    expect(d.view.shown).toBe(d.view.length);
  });

  it("picks choices with arrows and a press, only once the line has typed out", async () => {
    const d = createDialogEngine();
    const result = d.say({ text: "Go?", choices });
    d.choose("yes");
    expect(d.view.line).not.toBeNull();
    d.advance();
    d.move(1);
    expect(d.view.active).toBe(1);
    d.move(1);
    expect(d.view.active).toBe(0);
    d.move(-1);
    expect(d.view.active).toBe(1);
    d.choose("maybe");
    expect(d.view.line).not.toBeNull();
    d.advance();
    await expect(result).resolves.toEqual({ status: "done", choice: "no" });
  });

  it("Esc picks the cancel choice, and does nothing without one", async () => {
    const d = createDialogEngine();
    expect(d.escape()).toBe(false);
    const result = d.say({ text: "Go?", choices });
    expect(d.escape()).toBe(false);
    d.advance();
    expect(d.escape()).toBe(true);
    await expect(result).resolves.toEqual({ status: "done", choice: "no" });
  });

  it("waits on a try-it line until the world says so, then moves on by itself", async () => {
    const d = createDialogEngine();
    let release = () => {};
    const until = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const result = d.say([{ text: "Drive!", until }, "Nice!"]);
    expect(until).toHaveBeenCalledTimes(1);
    d.advance();
    expect(d.view.waiting).toBe(true);
    d.advance();
    expect(d.view.index).toBe(0);
    release();
    await flush();
    expect(d.view.index).toBe(1);
    d.advance();
    d.advance();
    await expect(result).resolves.toEqual({ status: "done", choice: null });
  });

  it("offers Continue on a try-it line after its fallback delay and aborts the wait", async () => {
    const d = createDialogEngine();
    const seen: { signal?: AbortSignal } = {};
    const until = (signal: AbortSignal) => {
      seen.signal = signal;
      return new Promise<void>(() => {});
    };
    const result = d.say([{ text: "Try", until, fallbackMs: 1000 }, "Next"]);
    d.advance();
    d.choose(CONTINUE_CHOICE);
    expect(d.view.index).toBe(0);
    d.tick(999);
    expect(d.view.fallback).toBe(false);
    d.tick(1);
    expect(d.view.fallback).toBe(true);
    d.choose(CONTINUE_CHOICE);
    expect(d.view.index).toBe(1);
    expect(seen.signal?.aborted).toBe(true);
    d.advance();
    d.advance();
    await expect(result).resolves.toMatchObject({ status: "done" });
  });

  it("queues requests and resolves them in order", async () => {
    const d = createDialogEngine();
    d.setInstant(true);
    const order: string[] = [];
    void d.say("A", { id: "a" }).then(() => order.push("a"));
    void d.say("B", { id: "b" }).then(() => order.push("b"));
    expect(d.view.id).toBe("a");
    expect(d.busy()).toBe(true);
    d.advance();
    await flush();
    expect(d.view.id).toBe("b");
    d.advance();
    await flush();
    expect(order).toEqual(["a", "b"]);
    expect(d.busy()).toBe(false);
  });

  it("cancels by id, queued or current, and everything at once", async () => {
    const d = createDialogEngine();
    const a = d.say("A", { id: "a" });
    const b = d.say("B", { id: "b" });
    const c = d.say("C", { id: "c" });
    d.cancel("b");
    await expect(b).resolves.toEqual({ status: "cancelled", choice: null });
    d.cancel("a");
    await expect(a).resolves.toEqual({ status: "cancelled", choice: null });
    expect(d.view.id).toBe("c");
    d.cancelAll();
    await expect(c).resolves.toMatchObject({ status: "cancelled" });
    expect(d.view.line).toBeNull();
  });

  it("skips only a request that offers it", async () => {
    const d = createDialogEngine();
    const plain = d.say("No skip", { id: "plain" });
    d.skip();
    expect(d.view.id).toBe("plain");
    d.cancel("plain");
    await plain;
    const tour = d.say(["One", "Two"], { id: "tour", skip: { label: "Skip tutorial" } });
    expect(d.view.skipLabel).toBe("Skip tutorial");
    d.skip();
    await expect(tour).resolves.toEqual({ status: "skipped", choice: null });
  });

  it("holds still while paused: no typing, no presses", () => {
    const d = createDialogEngine();
    void d.say("Paused line");
    d.setPaused(true);
    expect(d.view.paused).toBe(true);
    expect(d.tick(CHAR_MS * 5)).toBe(0);
    d.advance();
    expect(d.view.shown).toBe(0);
    d.setPaused(false);
    expect(d.tick(CHAR_MS * 2)).toBe(2);
  });

  it("notifies subscribers with every new view", () => {
    const d = createDialogEngine();
    const seen: (string | null)[] = [];
    const off = d.subscribe((view) => seen.push(view.line?.text ?? null));
    void d.say("Hi");
    d.advance();
    d.advance();
    off();
    expect(seen).toEqual(["Hi", "Hi", null]);
  });
});
