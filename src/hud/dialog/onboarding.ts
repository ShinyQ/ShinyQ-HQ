import type { FloorId } from "@/content/schema";
import type { Interactable } from "@/experience/hints/source";
import type { Vec2 } from "@/experience/types";
import type { HQStore } from "@/store/useHQStore";
import type { DialogLine, SayInput, SayOptions, SayResult } from "./engine";

/**
 * The first-session tour (owner request: "simple guidance at first, like old Pokemon games"). Plain
 * async code on top of `say()`, so it is tested with a fake `say`. OnboardingLayer runs it after the
 * intro (full) or after a deep link arrives (short), and from "Replay the tutorial" (full).
 */
export const ONBOARDING_ID = "onboarding";
/** The Highlights Hall's first station on L1 east (r4-g, registered as an L1 extra); the step is skipped without it. */
export const HIGHLIGHTS_ID = "L1:station:highlights-about";
/** Its room, matched when the station id differs. */
export const HIGHLIGHTS_ROOM = "L1:highlights-about";
/** A try-it step offers Continue after this long. */
export const TRY_IT_MS = 12_000;
/** The moving step is done once the rover has driven this far (keys, joystick or point-and-go). */
export const MOVE_DONE_U = 2;

export type OnboardingVariant = "full" | "short";
export type OnboardingOutcome = "done" | "skipped" | "cancelled";

export interface HighlightsTarget {
  floor: FloorId;
  at: Vec2;
}

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
  highlights: string;
  showMe: string;
  later: string;
  elevator: string;
  roverMenu: string;
  askAi: string;
  closing: string;
  closingShort: string;
  pointGoPhone: string;
  movedPhone: string;
  floorChip: string;
}

/** Every copy key, in `dialog.onboarding`; OnboardingLayer resolves them with its `t` once the chunk is in. */
export const COPY_KEYS = [
  "welcome", "start", "skip", "skipped", "moveFine", "moveCoarse", "pointGoFine", "pointGoCoarse", "moved",
  "cameraFine", "cameraCoarse", "highlights", "showMe", "later", "elevator", "roverMenu", "askAi", "closing", "closingShort",
  "pointGoPhone", "movedPhone", "floorChip",
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
  highlights: () => HighlightsTarget | null;
  showMe: (target: HighlightsTarget) => Promise<void>;
  /** The Ask AI pill is on screen (Ask the HQ enabled). */
  askAi: () => boolean;
  tryItMs?: number;
}

export function highlightsTarget(items: readonly Interactable[]): HighlightsTarget | null {
  const hall = items.find((i) => i.id === HIGHLIGHTS_ID) ?? items.find((i) => i.action.type === "open-room" && i.action.room === HIGHLIGHTS_ROOM);
  return hall ? { floor: hall.floor, at: { x: hall.at.x, z: hall.at.z } } : null;
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
    // Controls card), then the floor chip; no camera, Highlights Hall or elevator pad lines.
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
      // 3. The Highlights Hall on L1 east, when it exists.
      const hall = d.highlights();
      if (hall) {
        result = await d.say(
          {
            key: "highlights",
            text: copy.highlights,
            choices: [
              { id: "show", label: copy.showMe },
              { id: "later", label: copy.later, cancel: true },
            ],
          },
          tour,
        );
        end = await ended(result);
        if (end) return end;
        if (result.choice === "show") await d.showMe(hall);
      }

      // 4. Elevator and call pads.
      result = await d.say({ key: "elevator", text: copy.elevator, spotlight: "elevator" }, tour);
      end = await ended(result);
      if (end) return end;
    }
  }

  // 5. The Rover menu and Ask AI, each ringed while Rover talks about it.
  const ask: DialogLine[] = [{ key: "rover-menu", text: copy.roverMenu, spotlight: "rover-menu" }];
  if (d.askAi()) ask.push({ key: "ask-ai", text: copy.askAi, spotlight: "ask-ai" });
  result = await d.say(ask, tour);
  end = await ended(result);
  if (end) return end;

  // 6. Closing.
  result = await d.say({ key: "closing", text: d.variant === "full" ? copy.closing : copy.closingShort, face: "arrived" }, { id: ONBOARDING_ID });
  return result.status === "cancelled" ? "cancelled" : "done";
}
