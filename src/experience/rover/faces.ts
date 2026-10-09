import type { RoverFace } from "../types";

export interface FaceInput {
  phase: string;
  speed: number;
  autopilot: boolean;
  now: number;
  blockedUntil: number;
  arrivedUntil: number;
  ride: "up" | "down" | null;
}

/** Picks the face for the current state (appendix 03 section 1). */
export function faceFor(i: FaceInput): RoverFace {
  if (i.ride) return i.ride;
  if (i.now < i.blockedUntil) return "blocked";
  if (i.phase === "terminal" || i.phase === "palette") return "thinking";
  if (i.speed > 0.5) return i.autopilot ? "autopilot" : "driving";
  if (i.now < i.arrivedUntil) return "arrived";
  return "idle";
}

const SCROLL = [">  ", ">> ", ">>>", " >>", "  >", "   "];
const DOTS = [".  ", ".. ", "..."];

export interface FaceFrame {
  lines: string[];
  /** Changes only when the drawing must change, so the CanvasTexture is redrawn sparingly. */
  key: string;
}

/** Text drawn on the rover screen for a face at time `t` (seconds). */
export function faceFrame(face: RoverFace, t: number, opts: { blinking?: boolean; status?: string } = {}): FaceFrame {
  let main: string;
  switch (face) {
    case "idle":
      main = opts.blinking ? "-_-" : "^_^";
      break;
    case "blink":
      main = "-_-";
      break;
    case "driving":
    case "autopilot":
      main = SCROLL[Math.floor(t * 8) % SCROLL.length];
      break;
    case "thinking":
      main = DOTS[Math.floor(t * 3) % DOTS.length];
      break;
    case "arrived":
      main = "^_^";
      break;
    case "blocked":
      main = "o_o";
      break;
    case "up":
      main = "\u25B2";
      break;
    case "down":
      main = "\u25BC";
      break;
  }
  const status = opts.status?.slice(0, 12);
  const lines = status ? [main, status] : [main];
  return { lines, key: lines.join("\n") };
}
