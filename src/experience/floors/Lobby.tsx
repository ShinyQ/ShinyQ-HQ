"use client";

import { useState } from "react";
import { useHQStore } from "@/store/useHQStore";
import type { ExperienceData, GpuTier } from "../types";
import { useRingStats } from "../visits3d";
import { CertWall, type CertLabels } from "./lobby/CertWall";
import type { HallLabels } from "./lobby/hallContent";
import { HighlightsHall } from "./lobby/HighlightsHall";
import { Lanes } from "./lobby/Lanes";
import { MissionKiosk, type KioskLabels } from "./lobby/MissionKiosk";
import { ProfileHologram } from "./lobby/ProfileHologram";
import { SkillsWall } from "./lobby/SkillsWall";
import { StatsRing } from "./lobby/StatsRing";

export interface LobbyLabels {
  skillsTitle: string;
  /** The live visits tile on the stats ring (`stats.tile`). */
  visitsTile: string;
  certs: CertLabels;
  kiosk: KioskLabels;
  hall: HallLabels;
}

/**
 * The Highlights Hall builds once the visitor is (or rides) on L1 after the intro, and then stays: the
 * boot, the intro and a deep link that rides on to another floor never pay for its text and geometry.
 * It stands behind the certification wall, out of the spawn view, so it does not pop in when the intro hands over.
 */
function useHallReady(): boolean {
  const want = useHQStore((s) => s.phase !== "boot" && s.phase !== "intro" && (s.ride?.to ?? s.floor) === "L1");
  const [ready, setReady] = useState(want);
  if (want && !ready) setReady(true);
  return ready;
}

/** L1 Lobby (appendix 01 section 2), generated from content. */
export function Lobby({ data, labels, tier }: { data: ExperienceData; labels: LobbyLabels; tier: GpuTier }) {
  const hall = useHallReady();
  const stats = useRingStats(data.stats, data.locale, labels.visitsTile);
  return (
    <group name="lobby">
      <Lanes packets={tier === "full" ? 28 : 12} />
      <ProfileHologram name={data.profile.name} monogram={data.profile.monogram} headline={data.profile.headline} />
      <StatsRing key={stats.length} stats={stats} />
      <SkillsWall skills={data.skills} title={labels.skillsTitle} />
      <CertWall certifications={data.certifications} labels={labels.certs} tier={tier} />
      <MissionKiosk missions={data.missions} labels={labels.kiosk} />
      {hall && <HighlightsHall data={data} labels={labels.hall} tier={tier} />}
    </group>
  );
}
