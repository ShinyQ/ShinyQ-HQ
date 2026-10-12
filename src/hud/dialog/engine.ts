import type { RoverFace } from "@/experience/types";

/**
 * Rover's dialog engine: a queue of requests, each a list of lines shown one at a time in the text
 * box (src/hud/dialog/DialogBox.tsx). Framework-free and clock-free: the box drives `tick(ms)` while
 * it is visible, so tests advance time by hand. Reduced motion turns on `instant` (whole lines).
 */

/** Typewriter pace: one character every 28 ms (about 36 a second). */
export const CHAR_MS = 28;
/** One soft blip per this many typed characters. */
export const BLIP_EVERY = 3;
/** Choice id of the Continue button a try-it line offers after its fallback delay. */
export const CONTINUE_CHOICE = "continue";

export interface DialogChoice {
  id: string;
  label: string;
  /** Picked by Esc (for example "Not now", "Explore freely", "Skip tutorial"). */
  cancel?: boolean;
}

export interface DialogLine {
  text: string;
  /** Stable name of the line for tests (`data-line`). */
  key?: string;
  /** Rover's portrait emote. Default `idle`. */
  face?: RoverFace;
  choices?: readonly DialogChoice[];
  /** `data-onboard` name of a HUD control to ring while the line shows. */
  spotlight?: string;
  /** Try-it line: it moves on by itself once this resolves (aborted when the line ends). */
  until?: (signal: AbortSignal) => Promise<unknown>;
  /** With `until`: after this long (counted while visible), a Continue choice appears. */
  fallbackMs?: number;
}

export type SayInput = string | DialogLine | readonly (string | DialogLine)[];

export interface SayOptions {
  /** Request id: `onboarding`, `floor:L2`, `hint:<object id>`. Cancel by id. */
  id?: string;
  /** Shows a small skip button on every line of this request; pressing it resolves "skipped". */
  skip?: { label: string };
}

export interface SayResult {
  status: "done" | "skipped" | "cancelled";
  /** The choice picked on the request's last choice line, if any. */
  choice: string | null;
}

export interface DialogView {
  id: string | null;
  line: DialogLine | null;
  index: number;
  total: number;
  /** Characters typed so far. */
  shown: number;
  length: number;
  /** A try-it line still waits for the world. */
  waiting: boolean;
  /** The try-it fallback (Continue) is offered. */
  fallback: boolean;
  paused: boolean;
  /** Highlighted choice. */
  active: number;
  skipLabel: string | null;
}

export const IDLE_VIEW: DialogView = {
  id: null,
  line: null,
  index: 0,
  total: 0,
  shown: 0,
  length: 0,
  waiting: false,
  fallback: false,
  paused: false,
  active: 0,
  skipLabel: null,
};

export interface DialogEngine {
  readonly view: DialogView;
  say(input: SayInput, options?: SayOptions): Promise<SayResult>;
  /** A, Enter, Space, a click or a tap: completes the typing line, else advances (or picks the highlighted choice). */
  advance(): void;
  choose(id: string): void;
  move(delta: 1 | -1): void;
  /** Esc: picks the line's cancel choice; false when there is none. */
  escape(): boolean;
  skip(): void;
  /** Cancels every request with this id (current and queued). */
  cancel(id: string): void;
  cancelAll(): void;
  setPaused(paused: boolean): void;
  setInstant(instant: boolean): void;
  /** Advances the typewriter and the fallback clock; returns how many characters it revealed. */
  tick(ms: number): number;
  busy(): boolean;
  subscribe(listener: (view: DialogView) => void): () => void;
}

interface Request {
  id: string;
  lines: DialogLine[];
  skipLabel: string | null;
  choice: string | null;
  resolve: (result: SayResult) => void;
}

const isLine = (value: unknown): value is DialogLine => typeof value === "object" && value !== null && "text" in value;

export function linesOf(input: SayInput): DialogLine[] {
  if (typeof input === "string") return [{ text: input }];
  const list: readonly (string | DialogLine)[] = isLine(input) ? [input] : (input as readonly (string | DialogLine)[]);
  return list.map((line) => (typeof line === "string" ? { text: line } : line));
}

export function createDialogEngine(): DialogEngine {
  const queue: Request[] = [];
  const listeners = new Set<(view: DialogView) => void>();
  let view: DialogView = IDLE_VIEW;
  let index = 0;
  let shown = 0;
  let carry = 0;
  let waited = 0;
  let active = 0;
  let satisfied = true;
  let fallback = false;
  let paused = false;
  let instant = false;
  let abort: AbortController | null = null;

  const request = () => queue[0] ?? null;
  const current = () => request()?.lines[index] ?? null;
  const typed = (line: DialogLine) => shown >= line.text.length;

  function publish() {
    const req = request();
    const line = current();
    view =
      req && line
        ? { id: req.id, line, index, total: req.lines.length, shown, length: line.text.length, waiting: !satisfied, fallback, paused, active, skipLabel: req.skipLabel }
        : { ...IDLE_VIEW, paused };
    for (const listener of listeners) listener(view);
  }

  function startLine() {
    abort?.abort();
    abort = null;
    const line = current();
    shown = line && instant ? line.text.length : 0;
    carry = 0;
    waited = 0;
    active = 0;
    fallback = false;
    satisfied = !line?.until;
    if (line?.until) {
      const controller = new AbortController();
      abort = controller;
      Promise.resolve(line.until(controller.signal)).then(
        () => {
          if (controller.signal.aborted) return;
          satisfied = true;
          if (typed(line)) next();
          else publish();
        },
        () => undefined,
      );
    }
    publish();
  }

  function finish(status: SayResult["status"]) {
    const req = queue.shift();
    abort?.abort();
    abort = null;
    index = 0;
    req?.resolve({ status, choice: req.choice });
    if (queue.length) startLine();
    else {
      shown = 0;
      publish();
    }
  }

  function next() {
    const req = request();
    if (!req) return;
    if (index + 1 < req.lines.length) {
      index += 1;
      startLine();
    } else finish("done");
  }

  const engine: DialogEngine = {
    get view() {
      return view;
    },
    say(input, options = {}) {
      const lines = linesOf(input);
      return new Promise<SayResult>((resolve) => {
        if (!lines.length) {
          resolve({ status: "done", choice: null });
          return;
        }
        queue.push({ id: options.id ?? "say", lines, skipLabel: options.skip?.label ?? null, choice: null, resolve });
        if (queue.length === 1) {
          index = 0;
          startLine();
        }
      });
    },
    advance() {
      const line = current();
      if (!line || paused) return;
      if (!typed(line)) {
        shown = line.text.length;
        if (line.until && satisfied) next();
        else publish();
        return;
      }
      if (line.choices?.length) {
        engine.choose(line.choices[active].id);
        return;
      }
      if (!satisfied) {
        if (fallback) next();
        return;
      }
      next();
    },
    choose(id) {
      const line = current();
      const req = request();
      if (!line || !req || paused || !typed(line)) return;
      if (id === CONTINUE_CHOICE && !satisfied && fallback) {
        next();
        return;
      }
      if (!line.choices?.some((choice) => choice.id === id)) return;
      req.choice = id;
      next();
    },
    move(delta) {
      const line = current();
      const count = line?.choices?.length ?? 0;
      if (!line || !count || paused || !typed(line)) return;
      active = (active + delta + count) % count;
      publish();
    },
    escape() {
      const line = current();
      const cancel = line?.choices?.find((choice) => choice.cancel);
      if (!line || !cancel || paused || !typed(line)) return false;
      engine.choose(cancel.id);
      return true;
    },
    skip() {
      if (request()?.skipLabel && !paused) finish("skipped");
    },
    cancel(id) {
      for (let i = queue.length - 1; i >= 1; i -= 1) {
        if (queue[i].id !== id) continue;
        const [req] = queue.splice(i, 1);
        req.resolve({ status: "cancelled", choice: req.choice });
      }
      if (request()?.id === id) finish("cancelled");
    },
    cancelAll() {
      const all = queue.splice(0);
      abort?.abort();
      abort = null;
      index = 0;
      shown = 0;
      for (const req of all) req.resolve({ status: "cancelled", choice: req.choice });
      publish();
    },
    setPaused(next) {
      if (paused === next) return;
      paused = next;
      publish();
    },
    setInstant(next) {
      instant = next;
      const line = current();
      if (next && line && !typed(line)) {
        shown = line.text.length;
        publish();
      }
    },
    tick(ms) {
      const line = current();
      if (!line || paused) return 0;
      let revealed = 0;
      let changed = false;
      if (!typed(line)) {
        carry += ms;
        const count = Math.floor(carry / CHAR_MS);
        if (count > 0) {
          carry -= count * CHAR_MS;
          const before = shown;
          shown = Math.min(line.text.length, shown + count);
          revealed = shown - before;
          changed = true;
        }
      }
      if (typed(line) && line.until && satisfied) {
        next();
        return revealed;
      }
      if (!satisfied && !fallback && line.fallbackMs !== undefined) {
        waited += ms;
        if (waited >= line.fallbackMs) {
          fallback = true;
          changed = true;
        }
      }
      if (changed) publish();
      return revealed;
    },
    busy: () => queue.length > 0,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
  return engine;
}
