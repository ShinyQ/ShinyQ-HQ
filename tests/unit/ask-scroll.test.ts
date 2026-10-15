import { describe, expect, it } from "vitest";
import { ANSWER_TOP_GAP, anchoredScrollTop, askReducedMotion, scrolledAway } from "@/hud/ask/scroll";

const box = (scrollHeight: number, clientHeight = 400) => ({ scrollHeight, clientHeight });
const root = (motion?: string) => ({ getAttribute: (name: string) => (name === "data-motion" ? (motion ?? null) : null) }) as unknown as HTMLElement;

describe("anchoredScrollTop", () => {
  it("goes to the bottom without an answer to anchor", () => {
    expect(anchoredScrollTop(box(1000), null)).toBe(600);
    expect(anchoredScrollTop(box(300), null)).toBe(0);
  });
  it("shows the bottom while the whole answer fits", () => {
    expect(anchoredScrollTop(box(1000), 700)).toBe(600);
  });
  it("never scrolls past the answer's first line", () => {
    expect(anchoredScrollTop(box(2000), 500)).toBe(500 - ANSWER_TOP_GAP);
  });
  it("never goes below zero", () => {
    expect(anchoredScrollTop(box(2000), 4)).toBe(0);
  });
});

describe("scrolledAway", () => {
  it("is false before the panel scrolled and within the slack", () => {
    expect(scrolledAway(120, null)).toBe(false);
    expect(scrolledAway(126, 120)).toBe(false);
  });
  it("is true when the visitor moved the thread", () => {
    expect(scrolledAway(40, 120)).toBe(true);
    expect(scrolledAway(200, 120)).toBe(true);
  });
});

describe("askReducedMotion", () => {
  it("follows the Motion setting, then the OS", () => {
    expect(askReducedMotion(root("full"), () => true)).toBe(false);
    expect(askReducedMotion(root("reduced"), () => false)).toBe(true);
    expect(askReducedMotion(root(), () => true)).toBe(true);
    expect(askReducedMotion(root(), () => false)).toBe(false);
  });
});
