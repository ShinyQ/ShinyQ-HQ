"use client";

import { useEffect, useMemo } from "react";
import type { Locale } from "@/content/locales";
import { formatCount } from "@/lib/visits/model";
import { requestStats, useStats } from "@/lib/visits/store";
import { afterFirstFrameIdle } from "./boot-signals";
import type { ExperienceData } from "./types";

/** Starts the public stats fetch once the first 3D frame is out and the browser is idle (never on the boot path). */
export function useStatsAfterFirstFrame(): void {
  useEffect(() => afterFirstFrameIdle(() => void requestStats()), []);
}

/**
 * The L1 stats ring with the live visits tile appended once the snapshot is ready (visits since launch,
 * today included; the ring's L1:stats room links to the Visitor Observatory on the roof). The tile is
 * absent while loading or when the stats are hidden.
 */
export function useRingStats(stats: ExperienceData["stats"], locale: Locale, label: string): ExperienceData["stats"] {
  const { status, snapshot } = useStats();
  const visits = status === "ready" && snapshot ? snapshot.visits.all : null;
  return useMemo(() => (visits === null ? stats : [...stats, { id: "visits", value: formatCount(visits, locale), label }]), [stats, visits, locale, label]);
}
