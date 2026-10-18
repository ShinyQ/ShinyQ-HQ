import { describe, expect, it } from "vitest";
import { faceFor, faceFrame, type FaceInput } from "@/experience/rover/faces";
import { drawFace, FACE_H, FACE_W } from "@/experience/rover/faceTexture";

const base: FaceInput = { phase: "intro", speed: 0, autopilot: false, now: 10, blockedUntil: 0, arrivedUntil: 0, ride: null };

describe("wake faces", () => {
  it("shows the wake face over everything but a ride", () => {
    expect(faceFor({ ...base, wake: "off" })).toBe("off");
    expect(faceFor({ ...base, wake: "boot" })).toBe("boot");
    expect(faceFor({ ...base, wake: "off", speed: 4, autopilot: true, blockedUntil: 11, arrivedUntil: 11, phase: "terminal" })).toBe("off");
    expect(faceFor({ ...base, wake: "off", ride: "up" })).toBe("up");
  });

  it("falls back to the usual faces without a wake face", () => {
    expect(faceFor({ ...base, wake: null })).toBe("idle");
    expect(faceFor(base)).toBe("idle");
  });

  it("draws a dark screen for off", () => {
    expect(faceFrame("off", 0)).toEqual({ lines: [""], key: "off" });
    expect(faceFrame("off", 0, { status: "to L3" }).key).toBe("off");
  });

  it("blinks a boot cursor at 2.5 Hz and changes key only on the blink", () => {
    expect(faceFrame("boot", 0).lines[0]).toBe("_");
    expect(faceFrame("boot", 0.1).lines[0]).toBe("_");
    expect(faceFrame("boot", 0.3).lines[0]).toBe(" ");
    expect(faceFrame("boot", 0.45).lines[0]).toBe("_");
    expect(faceFrame("boot", 0).key).toBe(faceFrame("boot", 0.15).key);
    expect(faceFrame("boot", 0).key).not.toBe(faceFrame("boot", 0.3).key);
    expect(faceFrame("boot", 0, { status: "to L3" }).lines).toEqual(["_"]);
  });

  it("fills the off screen with near black and draws nothing else", () => {
    const calls: string[] = [];
    const ctx = {
      set fillStyle(v: string) {
        calls.push(`fillStyle:${v}`);
      },
      fillRect: (x: number, y: number, w: number, h: number) => calls.push(`fillRect:${x},${y},${w},${h}`),
      fillText: () => calls.push("fillText"),
    } as unknown as CanvasRenderingContext2D;
    drawFace(ctx, faceFrame("off", 0), "monospace");
    expect(calls).toEqual(["fillStyle:#010603", `fillRect:0,0,${FACE_W},${FACE_H}`]);
  });
});
