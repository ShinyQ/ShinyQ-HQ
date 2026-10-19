"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import { BOOT_RELEASED_ATTR } from "@/lib/boot-first";
import { markTime, PERF_MARKS } from "@/lib/perf-marks";
import type { RumPath, RumTier } from "@/lib/rum/protocol";
import { framePacer } from "../scene/framePacer";
import { RUM_ENDPOINT, RumSession } from "./rum";
import { RUM_SESSION_KEY } from "./rumDecision";

/**
 * Sampled sessions only (Experience decides once per session; lazy chunk): feeds frame times to the
 * session and sends one beacon on the first of: tab hidden, page left, 3D view closed, WebGL context
 * lost. `next dev` (Strict Mode) runs the cleanup once on mount, so check beacons on a production build.
 */
export default function RumProbe({ tier, path }: { tier: RumTier; path: RumPath }) {
  const gl = useThree((s) => s.gl);
  const [session] = useState(() => new RumSession({ tier, path }));

  useFrame((_, dt) => {
    // Idle cadence frames (30 fps or on demand) say nothing about how fast the device renders.
    if (framePacer.cadence < 60) return;
    session.frame(dt * 1000, performance.now(), markTime(PERF_MARKS.explore), document.visibilityState === "visible");
  });

  useEffect(() => {
    let done = false;
    const send = () => {
      if (done) return;
      done = true;
      try {
        if (sessionStorage.getItem(RUM_SESSION_KEY) === "sent") return;
        sessionStorage.setItem(RUM_SESSION_KEY, "sent");
      } catch {
        // Without storage the in-memory flag still sends once per page.
      }
      const body = JSON.stringify(session.payload({ released: document.documentElement.getAttribute(BOOT_RELEASED_ATTR), exploreAt: markTime(PERF_MARKS.explore) }));
      try {
        navigator.sendBeacon?.(RUM_ENDPOINT, body);
      } catch {
        // A refused beacon is a lost sample, never an error for the visitor.
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") send();
    };
    const canvas = gl.domElement;
    const onLost = () => {
      // Closing the 3D view also loses the context on purpose; only a canvas still on the page crashed.
      if (!canvas.isConnected) return;
      session.contextLost();
      send();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", send);
    canvas.addEventListener("webglcontextlost", onLost);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", send);
      canvas.removeEventListener("webglcontextlost", onLost);
      send();
    };
  }, [gl, session]);

  return null;
}
