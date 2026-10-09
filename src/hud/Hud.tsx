"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { READY_FLOORS } from "@/experience/config";
import type { ExperienceData } from "@/experience/types";
import { Link } from "@/i18n/navigation";
import { useHQStore } from "@/store/useHQStore";
import { BootOverlay } from "./BootOverlay";
import { DrawerHost } from "./drawer/DrawerHost";
import { HologramOverlay } from "./HologramOverlay";
import { MobileMenu, TopBar } from "./Controls";
import { ElevatorPanel } from "./ElevatorPanel";
import { Joystick } from "./Joystick";
import { ProfileCard } from "./ProfileCard";

function HintBar({ coarse, mobile }: { coarse: boolean; mobile: boolean }) {
  const t = useTranslations("hud");
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!mobile) return;
    const id = window.setTimeout(() => setHidden(true), 6000);
    return () => window.clearTimeout(id);
  }, [mobile]);
  if (hidden) return null;
  return (
    <p
      className={`glass pointer-events-none absolute left-1/2 max-w-[calc(100%-2rem)] -translate-x-1/2 px-4 py-2 text-center text-[13px] leading-5 text-ink-2 ${
        coarse ? "bottom-[156px]" : "bottom-4"
      }`}
      data-testid="hint"
    >
      {coarse ? t("hintCoarse") : t("hintFine")}
    </p>
  );
}

function FloorNotice({ data, mobile }: { data: ExperienceData; mobile: boolean }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  const exploring = useHQStore((s) => s.phase === "explore");
  if (!exploring || READY_FLOORS.includes(floor)) return null;
  const { name, route } = data.floors[floor];
  return (
    <div className={`glass pointer-events-auto absolute left-3 w-[min(280px,calc(100vw-5.5rem))] p-3 text-sm md:left-4 ${mobile ? "top-[68px]" : "top-[168px]"}`}>
      <p className="text-ink-2">{t("underConstruction", { name })}</p>
      <Link href={route} className="link mt-1 inline-flex min-h-11 items-center">
        {t("openFloorPage", { name })}
      </Link>
    </div>
  );
}

function IntroSkip() {
  const t = useTranslations("hud");
  const finishIntro = useHQStore((s) => s.finishIntro);
  return (
    <button
      type="button"
      onClick={finishIntro}
      className="glass pointer-events-auto absolute bottom-20 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center gap-2 rounded-full px-5 text-sm font-semibold text-ink"
    >
      {t("skipIntro")}
      <kbd className="label rounded border border-glass-border px-1.5 py-0.5 text-ink-3">Esc</kbd>
    </button>
  );
}

function FloorAnnouncer({ data }: { data: ExperienceData }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  return (
    <p className="sr-only" aria-live="polite" data-testid="floor-announcer">
      {t("currentFloor", { floor, name: data.floors[floor].name })}
    </p>
  );
}

/** Reduced motion replaces the elevator ride with a short fade cut. */
function CutFade() {
  const cut = useHQStore((s) => s.reducedMotion && s.ride?.stage === "moving");
  return <div aria-hidden="true" className={`pointer-events-none absolute inset-0 bg-void ${cut ? "opacity-100" : "opacity-0"}`} />;
}

/** HTML HUD over the canvas. It talks to the scene only through the store and intents. */
export function Hud({ data, onExit, onToggleLang }: { data: ExperienceData; onExit: () => void; onToggleLang: () => void }) {
  const phase = useHQStore((s) => s.phase);
  const viewport = useHQStore((s) => s.device.viewport);
  const coarse = useHQStore((s) => s.device.coarse);
  const mobile = viewport === "mobile";

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="hud" data-phase={phase}>
      <CutFade />
      {phase === "boot" ? (
        <BootOverlay name={data.profile.name} />
      ) : phase === "hologram" ? (
        // The hologram view owns the screen: only its own controls show.
        <HologramOverlay locale={data.locale} />
      ) : (
        <>
          <ProfileCard data={data} mobile={mobile} />
          {mobile ? <MobileMenu onExit={onExit} onToggleLang={onToggleLang} /> : <TopBar onExit={onExit} onToggleLang={onToggleLang} />}
          <ElevatorPanel data={data} compact={mobile} />
          <FloorNotice data={data} mobile={mobile} />
          {phase === "intro" ? <IntroSkip /> : <HintBar coarse={coarse} mobile={mobile} />}
          {coarse && phase !== "intro" && <Joystick />}
          <DrawerHost locale={data.locale} />
        </>
      )}
      <FloorAnnouncer data={data} />
    </div>
  );
}
