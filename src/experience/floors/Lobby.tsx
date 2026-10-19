"use client";

import { useFrame } from "@react-three/fiber";
import { Suspense, useEffect, useState } from "react";
import { useHQStore } from "@/store/useHQStore";
import { kioskRect, LOBBY } from "../config";
import type { ExperienceData, GpuTier, Rect } from "../types";
import { sceneProbes } from "../fx/probes";
import { introModule } from "../intro/chunk";
import { IntroReveal } from "../intro/IntroReveal";
import { postHandle } from "../scene/postHandle";
import { useRingStats } from "../visits3d";
import { CertWall, type CertLabels } from "./lobby/CertWall";
import type { HallLabels } from "./lobby/hallContent";
import { HALL } from "./lobby/hallLayout";
import { HighlightsHall } from "./lobby/HighlightsHall";
import { Lanes } from "./lobby/Lanes";
import { MissionKiosk, type KioskLabels } from "./lobby/MissionKiosk";
import type { ObservatoryLabels } from "./lobby/observatory";
import { ProfileHologram } from "./lobby/ProfileHologram";
import { SkillsWall } from "./lobby/SkillsWall";
import { StatsRing } from "./lobby/StatsRing";
import { VISITS_ROOM } from "./lobby/visitsRoom";
import { VisitsStation } from "./lobby/VisitsStation";
import type { OfficeTranslate } from "./lobby/officeLayout";

export interface LobbyLabels {
  skillsTitle: string;
  /** The live visits tile on the stats ring (`stats.tile`). */
  visitsTile: string;
  certs: CertLabels;
  kiosk: KioskLabels;
  hall: HallLabels;
  /** The Visitor Observatory panel (`stats.*`). */
  observatory: ObservatoryLabels;
  /** The `office` namespace translator (Agent Office: wall, screens, targets; the lazy chunk resolves its own keys). */
  office: OfficeTranslate;
}

const box = (cx: number, cz: number, w: number, d: number): Rect => ({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });

/** What the intro reveal ring must reach before each landmark switches on. */
const REVEAL = {
  hologram: box(LOBBY.hologram.x, LOBBY.hologram.z, 2 * (LOBBY.statsRadius + 2), 2 * (LOBBY.statsRadius + 2)),
  skills: box(LOBBY.skillsWall.x, LOBBY.skillsWall.z, LOBBY.skillsWall.w, LOBBY.skillsWall.d),
  certs: box(LOBBY.certWall.x, LOBBY.certWall.z, LOBBY.certWall.w, LOBBY.certWall.d),
  kiosk: kioskRect(),
  observatory: LOBBY.observatory,
  hall: { minX: HALL.zone.minX, maxX: HALL.zone.maxX, minZ: LOBBY.bounds.minZ, maxZ: LOBBY.bounds.maxZ },
} satisfies Record<string, Rect>;

/**
 * The Highlights Hall builds once the visitor is (or rides) on L1, and then stays. Every session that boots on
 * L1 builds it during the boot card, so the intro orbit can show it; a returning session that starts on another
 * floor builds it only when it rides to L1.
 */
function useHallReady(): boolean {
  const want = useHQStore((s) => (s.ride?.to ?? s.floor) === "L1");
  const [ready, setReady] = useState(want);
  if (want && !ready) setReady(true);
  return ready;
}

/**
 * Full tier: true once the lazy composer exists. A holo mesh mounted before it lets the frame-3 precompile
 * build a second, canvas-target variant of the holo program (sky/SkyController.tsx does the same).
 */
function useComposerLive(tier: GpuTier): boolean {
  const [live, setLive] = useState(tier !== "full");
  useFrame(() => {
    if (!live && postHandle.get()?.composer()) setLive(true);
  });
  return live;
}

/** L1 Lobby (appendix 01 section 2), generated from content. */
export function Lobby({ data, labels, tier }: { data: ExperienceData; labels: LobbyLabels; tier: GpuTier }) {
  const hall = useHallReady();
  const stats = useRingStats(data.stats, data.locale, labels.visitsTile);
  const reducedMotion = useHQStore((s) => s.reducedMotion);
  const observing = useHQStore((s) => s.phase === "room" && s.activeRoom === VISITS_ROOM);
  const intro = useHQStore((s) => s.phase === "intro");
  const composerLive = useComposerLive(tier);
  // From the intro chunk, loaded before the canvas mounts in a session that plays the intro (intro/chunk.ts).
  const IntroBeacons = introModule()?.IntroBeacons;
  useEffect(() => {
    sceneProbes.spectacle.ringTiles = stats.length;
  }, [stats.length]);
  return (
    <group name="lobby">
      <Lanes packets={tier === "full" ? 28 : 12} />
      <IntroReveal rect={REVEAL.hologram}>
        <ProfileHologram name={data.profile.name} headline={data.profile.headline} />
        <StatsRing key={stats.length} stats={stats} />
      </IntroReveal>
      <IntroReveal rect={REVEAL.skills}>
        <SkillsWall skills={data.skills} title={labels.skillsTitle} />
      </IntroReveal>
      <IntroReveal rect={REVEAL.certs}>
        <CertWall certifications={data.certifications} labels={labels.certs} tier={tier} />
      </IntroReveal>
      <IntroReveal rect={REVEAL.kiosk}>
        <MissionKiosk missions={data.missions} labels={labels.kiosk} />
      </IntroReveal>
      <IntroReveal rect={REVEAL.observatory}>
        {/* Text loads fonts asynchronously; keep it from holding back the rest of the Lobby. */}
        <Suspense fallback={null}>
          <VisitsStation labels={labels.observatory} locale={data.locale} tier={tier} reducedMotion={reducedMotion} active={observing} />
        </Suspense>
      </IntroReveal>
      {hall && (
        <IntroReveal rect={REVEAL.hall}>
          <HighlightsHall data={data} labels={labels.hall} tier={tier} />
        </IntroReveal>
      )}
      {intro && composerLive && IntroBeacons && <IntroBeacons tier={tier} />}
    </group>
  );
}
