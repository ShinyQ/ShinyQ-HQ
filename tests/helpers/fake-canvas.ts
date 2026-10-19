/**
 * A CanvasRenderingContext2D stand-in that records every call and property write (node has no canvas), so pure
 * drawing functions can be tested: `texts()` lists `fillText` strings in order, `named(m)` the calls of one method.
 */
export interface CanvasCall {
  name: string;
  args: unknown[];
}

export function recordingContext(): { ctx: CanvasRenderingContext2D; calls: CanvasCall[]; texts: () => string[]; named: (name: string) => CanvasCall[] } {
  const calls: CanvasCall[] = [];
  const state: Record<string, unknown> = {};
  const target: Record<string, unknown> = {};
  const ctx = new Proxy(target, {
    get(_, key) {
      if (typeof key !== "string") return undefined;
      if (key in state) return state[key];
      if (key === "measureText") return (text: string) => ({ width: text.length * 7 });
      return (...args: unknown[]) => {
        calls.push({ name: key, args });
      };
    },
    set(_, key, value) {
      if (typeof key !== "string") return false;
      state[key] = value;
      calls.push({ name: `set:${key}`, args: [value] });
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
  return {
    ctx,
    calls,
    texts: () => calls.filter((c) => c.name === "fillText").map((c) => String(c.args[0])),
    named: (name: string) => calls.filter((c) => c.name === name),
  };
}
