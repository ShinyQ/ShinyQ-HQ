"use client";

import { useTranslations } from "next-intl";
import { createElement, Suspense, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { READY_FLOORS } from "@/experience/config";
import { floorChunks } from "@/experience/floors/floorChunks";
import type { ExperienceData } from "@/experience/types";
import { Link } from "@/i18n/navigation";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { BootOverlay } from "./BootOverlay";
// Rover's dialog rides in the 3D chunk (itself lazy): a second dynamic import here made Turbopack
// regroup shared modules into Page View chunks (+7 KB JS on every page, over the Lighthouse budget).
import DialogLayer from "./dialog/DialogLayer";
import { FloorIntroLayer } from "./dialog/FloorIntroLayer";
import { HintLayer } from "./dialog/HintLayer";
import { OnboardingLayer } from "./dialog/OnboardingLayer";
import { firstName } from "./dialog/onboarding";
import { useDialog } from "./dialog/store";
import { DrawerHost } from "./drawer/DrawerHost";
import { InteractStatus } from "./InteractStatus";
import { lazyFromChunk } from "./lazyFromChunk";
import { AskPill } from "./ask/AskPill";
import { launcher, TopBar } from "./Controls";
import { ElevatorPanel } from "./ElevatorPanel";
import { FloorChip } from "./FloorChip";
import { HudLaunchers } from "./HudLaunchers";
import { useHudLayout, type HudLayout } from "./layout";
import { HudMenu } from "./menu/HudMenu";
import { SettingsLauncher } from "./menu/SettingsSheet";
import { BeamFade, PadPicker } from "./pads/PadPicker";
import { Joystick } from "./Joystick";
import { ProfileCard } from "./ProfileCard";
import { ResetView, ViewControls } from "./ViewControls";
import { YearChip } from "./YearChip";

type HologramOverlayProps = ComponentProps<typeof import("@/experience/floors/chunks/labs").HologramOverlay>;

/** Stands in when the L3 chunk fails: leaves the hologram view (Esc and close live only in the overlay) so the HUD is never stuck. */
function HologramUnavailable() {
  useEffect(() => {
    getHQStore().getState().closeHologram();
  }, []);
  return null;
}

// The hologram view only opens on L3, whose chunk carries the overlay (Round 7 B); a failed import is retried on the next open.
const lazyHologramOverlay = lazyFromChunk<HologramOverlayProps>(() => floorChunks.load("L3").then((m) => m.HologramOverlay), HologramUnavailable);

function HologramView({ locale }: { locale: HologramOverlayProps["locale"] }) {
  const overlay = lazyHologramOverlay();
  return (
    <Suspense fallback={null}>
      {createElement(overlay, { locale })}
    </Suspense>
  );
}

/** Control hints, in the bottom band's center column under point-and-go's status. */
function HintBar({ coarse, mobile }: { coarse: boolean; mobile: boolean }) {
  const t = useTranslations("hud");
  const rail = useHQStore((s) => s.floor === "L2");
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!mobile) return;
    const id = window.setTimeout(() => setHidden(true), 6000);
    return () => window.clearTimeout(id);
  }, [mobile]);
  if (hidden) return null;
  return (
    <p className="glass glass-solid pointer-events-none order-last max-w-full px-4 py-2 text-center text-[13px] leading-5 text-ink-2" data-testid="hint">
      {coarse ? (rail ? t("career.scrubHint") : t("hintCoarse")) : t("hintFine")}
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
    <div className={`glass glass-solid pointer-events-auto absolute left-3 w-[min(280px,calc(100vw-5.5rem))] p-3 text-sm md:left-4 ${mobile ? "top-[116px]" : "top-[168px]"}`}>
      <p className="text-ink-2">{t("underConstruction", { name })}</p>
      <Link href={route} className="link mt-1 inline-flex min-h-11 items-center">
        {t("openFloorPage", { name })}
      </Link>
    </div>
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

/**
 * Bottom HUD band: one flex row, so nothing in it can overlap (owner request: the hint sits at the
 * bottom on tablets and phones). Left: the joystick (coarse pointers; a double tap toggles boost).
 * Center: point-and-go's status above the controls hint. Right: on desktops the settings gear above
 * the view controls, in Corners one reset button. It hugs the bottom edge above the iOS home
 * indicator (safe area).
 */
function BottomBand({ left, right, children }: { left: ReactNode; right: ReactNode; children: ReactNode }) {
  return (
    <div data-testid="hud-bottom" className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 pr-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-5 md:pr-4">
      <div className="flex shrink-0 flex-col-reverse items-end gap-3 sm:flex-1 sm:flex-row sm:items-center">{left}</div>
      <div data-testid="hud-bottom-center" className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2 sm:flex-initial">
        {children}
      </div>
      <div className="flex shrink-0 justify-end sm:flex-1">{right}</div>
    </div>
  );
}

/**
 * Corners HUD top right (phones and tablets): Ask AI (icon only on phones), search on tablets (Ask
 * Rover lives in the menu), then the menu.
 */
function CornersTopBar({ data, layout, onExit }: { data: ExperienceData; layout: HudLayout; onExit: () => void }) {
  return (
    <div className="pointer-events-auto absolute top-3 right-3 flex items-center gap-2 md:top-4 md:right-4" data-testid="hud-topbar">
      <AskPill compact={layout === "phone"} />
      {layout === "tablet" && <HudLaunchers parts={["search"]} buttonClassName={launcher} labelClassName="sr-only" />}
      <HudMenu data={data} layout={layout} onExit={onExit} />
    </div>
  );
}

/** Desktop bottom right: the settings gear above the view controls (Task 7 adds the minimap here). */
function DesktopCorner({ explorable }: { explorable: boolean }) {
  return (
    <div className="flex flex-col items-end gap-2" data-testid="hud-corner">
      <SettingsLauncher showButton={explorable} />
      {explorable && <ViewControls />}
    </div>
  );
}

/**
 * HTML HUD over the canvas. It talks to the scene only through the store and intents. Desktops keep
 * the profile card, the top bar and the elevator rail; phones and tablets get the Corners HUD (floor
 * chip top left, Ask AI and the menu top right, the joystick and one reset button at the bottom).
 */
export function Hud({ data, onExit, onToggleLang }: { data: ExperienceData; onExit: () => void; onToggleLang: () => void }) {
  const phase = useHQStore((s) => s.phase);
  const viewport = useHQStore((s) => s.device.viewport);
  const coarse = useHQStore((s) => s.device.coarse);
  const layout = useHudLayout();
  const desktop = layout === "desktop";
  const mobile = viewport === "mobile";
  const speaking = useDialog((v) => v.line !== null);
  const explorable = phase !== "intro" && phase !== "room";
  const drive = coarse && phase !== "intro";

  // The Ask teaser and other page-level styles position against the HUD layout.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.hqHud = layout;
    return () => {
      delete root.dataset.hqHud;
    };
  }, [layout]);

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="hud" data-phase={phase}>
      <CutFade />
      <BeamFade />
      {phase === "boot" ? (
        <BootOverlay who={{ name: data.profile.name, headline: data.profile.headline, motto: data.profile.motto, role: data.profile.role }} />
      ) : phase === "hologram" ? (
        // The hologram view owns the screen: only its own controls show.
        <HologramView locale={data.locale} />
      ) : (
        <>
          {desktop ? (
            <>
              <ProfileCard data={data} />
              <TopBar onExit={onExit} onToggleLang={onToggleLang} />
              <ElevatorPanel data={data} compact={false} />
            </>
          ) : (
            <>
              <div className="pointer-events-none absolute top-3 left-3 max-w-[calc(100vw-9rem)] md:top-4 md:left-4">
                <FloorChip data={data} layout={layout} />
              </div>
              <CornersTopBar data={data} layout={layout} onExit={onExit} />
            </>
          )}
          <FloorNotice data={data} mobile={mobile} />
          {phase !== "intro" && <YearChip career={data.career} mobile={mobile} hidden={mobile && phase === "room"} />}
          <BottomBand
            // Coarse pointers always get the Corners HUD, which has no Boost button: a double tap on the joystick toggles boost.
            left={drive ? <Joystick boost /> : null}
            right={desktop ? <DesktopCorner explorable={explorable} /> : explorable ? <ResetView /> : null}
          >
            <InteractStatus coarse={coarse} />
            {explorable && !speaking && <HintBar coarse={coarse} mobile={mobile} />}
          </BottomBand>
          <DrawerHost locale={data.locale} />
        </>
      )}
      <FloorIntroLayer data={data} />
      <FloorAnnouncer data={data} />
      <OnboardingLayer data={data} />
      <HintLayer name={firstName(data.profile.name)} />
      {speaking && <DialogLayer />}
      <PadPicker data={data} />
    </div>
  );
}
