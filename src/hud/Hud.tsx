"use client";

import { useTranslations } from "next-intl";
import { createElement, Suspense, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { READY_FLOORS } from "@/experience/floorOrder";
import { floorChunks } from "@/experience/floors/floorChunks";
import type { ExperienceData, FloorLayouts } from "@/experience/types";
import { Link } from "@/i18n/navigation";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { BootOverlay } from "./BootOverlay";
// Rover's dialog rides in the 3D chunk (itself lazy): a second dynamic import here made Turbopack
// regroup shared modules into Page View chunks (+7 KB JS on every page, over the Lighthouse budget).
import DialogLayer from "./dialog/DialogLayer";
import { EngineUnlockLayer } from "./dialog/EngineUnlockLayer";
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
import { Minimap } from "./minimap/Minimap";
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

/** Under the floor chip in Corners (narrow enough to clear the minimap on the right), under the profile card on desktops. */
const NOTICE_PLACE: Record<HudLayout, string> = {
  phone: "top-[64px] left-3 w-[min(280px,calc(100vw-7.5rem))]",
  tablet: "top-[76px] left-4 w-[min(280px,calc(100vw-11rem))]",
  desktop: "top-[168px] left-4 w-[min(280px,calc(100vw-5.5rem))]",
};

function FloorNotice({ data, layout }: { data: ExperienceData; layout: HudLayout }) {
  const t = useTranslations("hud");
  const floor = useHQStore((s) => s.floor);
  const exploring = useHQStore((s) => s.phase === "explore");
  if (!exploring || READY_FLOORS.includes(floor)) return null;
  const { name, route } = data.floors[floor];
  return (
    <div className={`glass glass-solid pointer-events-auto absolute p-3 text-sm ${NOTICE_PLACE[layout]}`}>
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

/** Corners minimap: under the top-right cluster. */
const TEASER_TOP_VAR = "--hq-teaser-top";
/** Ask teaser top offset under the minimap (phone 72 px at 64 px, tablet 112 px at 76 px, plus a gap). */
const TEASER_TOP: Record<Exclude<HudLayout, "desktop">, string> = { phone: "148px", tablet: "200px" };
const MINIMAP_PLACE: Record<Exclude<HudLayout, "desktop">, string> = { phone: "top-[64px] right-3", tablet: "top-[76px] right-4" };

/** Desktop bottom right: the minimap and the settings gear above the view controls. */
function DesktopCorner({ data, layouts, explorable }: { data: ExperienceData; layouts: FloorLayouts; explorable: boolean }) {
  return (
    <div className="flex flex-col items-end gap-2" data-testid="hud-corner">
      <Minimap data={data} layouts={layouts} size="desktop" />
      <SettingsLauncher showButton={explorable} />
      {explorable && <ViewControls />}
    </div>
  );
}

/**
 * HTML HUD over the canvas. It talks to the scene only through the store and intents. Desktops keep
 * the profile card, the top bar and the elevator rail; phones and tablets get the Corners HUD (floor
 * chip top left, Ask AI and the menu top right with the minimap under them, the joystick and one reset
 * button at the bottom). Desktops show the minimap bottom right, above the settings gear and the view
 * controls. `N` opens the floor overview on every layout.
 */
export function Hud({ data, layouts, onExit, onToggleLang }: { data: ExperienceData; layouts: FloorLayouts; onExit: () => void; onToggleLang: () => void }) {
  const phase = useHQStore((s) => s.phase);
  const coarse = useHQStore((s) => s.device.coarse);
  const layout = useHudLayout();
  const desktop = layout === "desktop";
  const phone = layout === "phone";
  const speaking = useDialog((v) => v.line !== null);
  const explorable = phase !== "intro" && phase !== "room";
  const drive = coarse && phase !== "intro";

  // The Ask teaser and other page-level styles position against the HUD layout: the teaser sits under the
  // minimap on phones and tablets, and under the desktop top bar (the profile card's right edge) otherwise.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.hqHud = layout;
    const wide = typeof window.matchMedia === "function" ? window.matchMedia("(min-width: 1024px)") : null;
    const place = () => root.style.setProperty(TEASER_TOP_VAR, layout === "desktop" ? (wide?.matches ? "76px" : "124px") : TEASER_TOP[layout]);
    place();
    wide?.addEventListener("change", place);
    return () => {
      wide?.removeEventListener("change", place);
      delete root.dataset.hqHud;
      root.style.removeProperty(TEASER_TOP_VAR);
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
              <div className={`pointer-events-none absolute ${MINIMAP_PLACE[layout]}`} data-testid="hud-minimap">
                {/* A phone's room sheet covers the lower screen: the minimap steps aside until it closes (the room is aria-modal, so N waits too). */}
                <Minimap data={data} layouts={layouts} size={layout} hidden={phone && phase === "room"} />
              </div>
            </>
          )}
          <FloorNotice data={data} layout={layout} />
          {phase !== "intro" && <YearChip career={data.career} layout={layout} hidden={phone && phase === "room"} />}
          <BottomBand
            // Coarse pointers always get the Corners HUD: a double tap on the joystick toggles boost.
            left={drive ? <Joystick boost /> : null}
            right={desktop ? <DesktopCorner data={data} layouts={layouts} explorable={explorable} /> : explorable ? <ResetView /> : null}
          >
            <InteractStatus coarse={coarse} />
            {explorable && !speaking && <HintBar coarse={coarse} mobile={phone} />}
          </BottomBand>
          <DrawerHost locale={data.locale} />
        </>
      )}
      <FloorIntroLayer data={data} />
      <EngineUnlockLayer />
      <FloorAnnouncer data={data} />
      <OnboardingLayer data={data} />
      <HintLayer name={firstName(data.profile.name)} />
      {speaking && <DialogLayer />}
      <PadPicker data={data} />
    </div>
  );
}
