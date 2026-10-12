"use client";

import { useEffect, useRef, useState } from "react";
import { drawFace, FACE_H, FACE_W } from "@/experience/rover/faceTexture";
import { faceFrame } from "@/experience/rover/faces";
import type { RoverFace } from "@/experience/types";

/** Rover's screen as a 2D portrait: the same drawing as the in-world face texture, blinking unless still. */
export function RoverPortrait({ face, still }: { face: RoverFace; still: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [blink, setBlink] = useState(false);

  useEffect(() => {
    if (still) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(() => {
        setBlink(true);
        timer = window.setTimeout(() => {
          setBlink(false);
          schedule();
        }, 150);
      }, 3000 + Math.random() * 3000);
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [still]);

  useEffect(() => {
    const ctx = canvas.current?.getContext("2d");
    if (!ctx) return;
    const font = getComputedStyle(document.documentElement).getPropertyValue("--font-jetbrains").trim() || "monospace";
    drawFace(ctx, faceFrame(face, 0, { blinking: blink }), font);
  }, [face, blink]);

  return (
    <canvas
      ref={canvas}
      width={FACE_W}
      height={FACE_H}
      aria-hidden="true"
      className="h-9 w-12 shrink-0 rounded-sm border-2 border-terminal-fg/60 [image-rendering:pixelated] sm:h-12 sm:w-16"
    />
  );
}
