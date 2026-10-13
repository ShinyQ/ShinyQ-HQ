"use client";

import { useEffect } from "react";
import { startVisitBeacon } from "@/lib/stats/visitClient";

/** Starts the first-party visit beacon once per page lifetime (public visit stats). Renders nothing. */
export function VisitBeacon() {
  useEffect(() => startVisitBeacon(), []);
  return null;
}
