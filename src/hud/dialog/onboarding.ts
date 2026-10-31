import type { HQStore } from "@/store/useHQStore";
import type { DialogLine, SayInput, SayOptions, SayResult } from "./engine";

/**
 * The first-session tour (owner request: "simple guidance at first, like old Pokemon games"). Plain
 * async code on top of `say()`, so it is tested with a fake `say`. OnboardingLayer runs it after the
 * intro (full) or after a deep link arrives (short), and from "Replay the tutorial" (full). It never moves the rover
 * by itself (owner decision 2026-10-27: no "take me there" step).
 */
export const ONBOARDING_ID = "onboarding";
/** A try-it step offers Continue after this long. */
export const TRY_IT_MS = 12_000;
/** The moving step is done once the rover has driven this far (keys, joystick or point-and-go). */
export const MOVE_DONE_U = 2;

export type OnboardingVariant = "full" | "short";
export type OnboardingOutcome = "done" | "skipped" | "cancelled";

export interface OnboardingCopy {
  welcome: string;
  start: string;
  skip: string;
  skipped: string;
  moveFine: string;
  moveCoarse: string;
  pointGoFine: string;
  pointGoCoarse: string;
  moved: string;
  cameraFine: string;
  cameraCoarse: string;
  elevator: string;
  roverMenu: string;
  askAi: string;
  closing: string;
  closingShort: string;
  pointGoPhone: string;
  movedPhone: string;
  floorChip: string;
  tilt: string;
}

/** Every copy key, in `dialog.onboarding`; OnboardingLayer resolves them with its `t` once the chunk is in. */
export const COPY_KEYS = [
  "welcome", "start", "skip", "skipped", "moveFine", "moveCoarse", "pointGoFine", "pointGoCoarse", "moved",
  "cameraFine", "cameraCoarse", "elevator", "roverMenu", "askAi", "closing", "closingShort",
  "pointGoPhone", "movedPhone", "floorChip", "tilt",
] as const satisfies readonly (keyof OnboardingCopy)[];

/** A `t` of the `dialog.onboarding` namespace; every line gets `{ name }` (lines without the placeholder ignore it). */
export type TourT = (key: string, values: { name: string }) => string;

export function onboardingCopy(t: TourT, name: string): OnboardingCopy {
  return Object.fromEntries(COPY_KEYS.map((key) => [key, t(key, { name })])) as unknown as OnboardingCopy;
}

export interface OnboardingDeps {
  say: (input: SayInput, options?: SayOptions) => Promise<SayResult>;
  copy: OnboardingCopy;
  coarse: boolean;
  /** A phone (the Corners phone HUD with touch): the short phone script. */
  phone: boolean;
  variant: OnboardingVariant;
  waitForMove: (signal: AbortSignal) => Promise<void>;
  /** The Ask AI pill is on screen (Ask the HQ enabled). */
  askAi: () => boolean;
  tryItMs?: number;
  /** Cancels a dialog request by id (the store's `cancelDialog`): a rotation ends the tilt hint. */
  cancel?: (id: string) => void;
  /** The tilt hint after the closing line; null for none. Omitted: the browser's (`browserTilt`). */
  tilt?: TiltDeps | null;
}

/**
 * The one-time tilt hint (spec 2026-10-29, owner decisions 3.6, 3.7, 3.9): after the tour's closing line, a portrait touch
 * screen (phone or tablet) hears once that sideways shows a wider view. A tap or the toast hold ends it, and so does a
 * rotation. Never a lock or an overlay (iOS Safari cannot lock the orientation).
 */
export interface TiltDeps {
  /** A coarse pointer on a portrait screen that has not had the hint. */
  due: () => boolean;
  /** Marks the hint as had (when it shows). */
  seen: () => void;
  /** Resolves when the screen turns (or the signal aborts). */
  rotated: (signal: AbortSignal) => Promise<void>;
  cancel: (id: string) => void;
}

/** localStorage: the tilt hint was shown on this device. */
export const TILT_KEY = "hq:tilt-hint";
export const TILT_ID = "tilt";
const PORTRAIT = "(orientation: portrait)";

export function browserTilt(coarse: boolean, cancel: (id: string) => void = () => {}): TiltDeps | null {
  if (!coarse || typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
  const portrait = window.matchMedia(PORTRAIT);
  return {
    due: () => {
      try {
        return portrait.matches && !window.localStorage.getItem(TILT_KEY);
      } catch {
        return false;
      }
    },
    seen: () => {
      try {
        window.localStorage.setItem(TILT_KEY, "1");
      } catch {
        // Storage off: the hint may show again next session, which is harmless.
      }
    },
    rotated: (signal) =>
      new Promise((resolve) => {
        const done = () => {
          portrait.removeEventListener("change", done);
          signal.removeEventListener("abort", done);
          resolve();
        };
        portrait.addEventListener("change", done);
        signal.addEventListener("abort", done, { once: true });
      }),
    cancel,
  };
}

/** Resolves once the rover has moved `distance` from where it stood, changed floor, or the line ended. */
export function waitForRoverMove(store: Pick<HQStore, "getState" | "subscribe">, signal: AbortSignal, distance = MOVE_DONE_U): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const start = store.getState();
    const from = { x: start.rover.x, z: start.rover.z };
    let off = () => {};
    const done = () => {
      off();
      signal.removeEventListener("abort", done);
      resolve();
    };
    off = store.subscribe((s) => {
      if (s.floor !== start.floor || Math.hypot(s.rover.x - from.x, s.rover.z - from.z) >= distance) done();
    });
    signal.addEventListener("abort", done, { once: true });
  });
}

export async function runOnboarding(d: OnboardingDeps): Promise<OnboardingOutcome> {
  const { copy } = d;
  const tour: SayOptions = { id: ONBOARDING_ID, skip: { label: copy.skip } };
  const ended = async (result: SayResult): Promise<OnboardingOutcome | null> => {
    if (result.status === "cancelled") return "cancelled";
    if (result.status === "skipped" || result.choice === "skip") {
      await d.say({ key: "skipped", text: copy.skipped, face: "arrived" }, { id: ONBOARDING_ID });
      return "skipped";
    }
    return null;
  };

  // 1. Welcome, with "Skip tutorial" as its second choice (the skip button joins from the next line).
  let result = await d.say(
    {
      key: "welcome",
      text: copy.welcome,
      face: "arrived",
      choices: [
        { id: "start", label: copy.start },
        { id: "skip", label: copy.skip, cancel: true },
      ],
    },
    { id: ONBOARDING_ID },
  );
  let end = await ended(result);
  if (end) return end;

  if (d.phone) {
    // Phones (owner decision 2026-10-25): tap-to-go first (the joystick and Boost are on screen and in the menu's
    // Controls card), then the floor chip; no camera or elevator pad lines.
    result = await d.say(
      [
        { key: "point-go", text: copy.pointGoPhone, until: d.waitForMove, fallbackMs: d.tryItMs ?? TRY_IT_MS },
        { key: "moved", text: copy.movedPhone, face: "arrived" },
        { key: "floor-chip", text: copy.floorChip, spotlight: "elevator" },
      ],
      tour,
    );
    end = await ended(result);
    if (end) return end;
  } else {
    // 2. Moving: keys or joystick and boost, then point-and-go (there is no click-the-floor driving any
    // more: desktop points and clicks a glowing object, touch taps it twice or uses its Go chip); waits
    // until the rover moves, whichever way. Then the camera (round 5): look around, zoom, first person.
    result = await d.say(
      [
        { key: "move", text: d.coarse ? copy.moveCoarse : copy.moveFine },
        { key: "point-go", text: d.coarse ? copy.pointGoCoarse : copy.pointGoFine, until: d.waitForMove, fallbackMs: d.tryItMs ?? TRY_IT_MS },
        { key: "moved", text: copy.moved, face: "arrived" },
        { key: "camera", text: d.coarse ? copy.cameraCoarse : copy.cameraFine, spotlight: "view" },
      ],
      tour,
    );
    end = await ended(result);
    if (end) return end;

    if (d.variant === "full") {
      // 3. Elevator and call pads.
      result = await d.say({ key: "elevator", text: copy.elevator, spotlight: "elevator" }, tour);
      end = await ended(result);
      if (end) return end;
    }
  }

  // 4. The Rover menu and Ask AI, each ringed while Rover talks about it.
  const ask: DialogLine[] = [{ key: "rover-menu", text: copy.roverMenu, spotlight: "rover-menu" }];
  if (d.askAi()) ask.push({ key: "ask-ai", text: copy.askAi, spotlight: "ask-ai" });
  result = await d.say(ask, tour);
  end = await ended(result);
  if (end) return end;

  // 5. Closing.
  result = await d.say({ key: "closing", text: d.variant === "full" ? copy.closing : copy.closingShort, face: "arrived" }, { id: ONBOARDING_ID });
  if (result.status === "cancelled") return "cancelled";

  // 6. The tilt hint, once per device on a portrait touch screen; a rotation ends it.
  const tilt = d.tilt === undefined ? browserTilt(d.coarse, d.cancel) : d.tilt;
  if (tilt?.due()) {
    tilt.seen();
    const stop = new AbortController();
    void tilt.rotated(stop.signal).then(() => {
      if (!stop.signal.aborted) tilt.cancel(TILT_ID);
    });
    await d.say({ key: "tilt", text: copy.tilt }, { id: TILT_ID });
    stop.abort();
  }
  return "done";
}
