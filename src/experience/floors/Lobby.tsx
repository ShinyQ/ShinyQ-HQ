"use client";

import type { ExperienceData, GpuTier } from "../types";
import { CertWall, type CertLabels } from "./lobby/CertWall";
import { Lanes } from "./lobby/Lanes";
import { MissionKiosk, type KioskLabels } from "./lobby/MissionKiosk";
import { ProfileHologram } from "./lobby/ProfileHologram";
import { SkillsWall } from "./lobby/SkillsWall";
import { StatsRing } from "./lobby/StatsRing";

export interface LobbyLabels {
  skillsTitle: string;
  certs: CertLabels;
  kiosk: KioskLabels;
}

/** L1 Lobby (appendix 01 section 2), generated from content. */
export function Lobby({ data, labels, tier }: { data: ExperienceData; labels: LobbyLabels; tier: GpuTier }) {
  return (
    <group name="lobby">
      <Lanes packets={tier === "full" ? 28 : 12} />
      <ProfileHologram name={data.profile.name} monogram={data.profile.monogram} headline={data.profile.headline} />
      <StatsRing stats={data.stats} />
      <SkillsWall skills={data.skills} title={labels.skillsTitle} />
      <CertWall certifications={data.certifications} labels={labels.certs} />
      <MissionKiosk missions={data.missions} labels={labels.kiosk} />
    </group>
  );
}
