"use client";

import { useTranslations } from "next-intl";
import { createElement, Suspense, useEffect, useLayoutEffect, useRef, type ComponentProps, type ReactNode, type RefObject } from "react";
import { READY_FLOORS } from "@/experience/floorOrder";
import { floorChunks } from "@/experience/floors/floorChunks";
import { setBoost, setJoystick, stickInput } from "@/experience/input/joystick";
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
import { firstName } from "./dialog/names";
import { docks } from "./dialog/placement";
import { useDialog } from "./dialog/store";
import { DrawerHost } from "./drawer/DrawerHost";
import { InteractStatus } from "./InteractStatus";
import { OfficeLayer } from "./OfficeLayer";
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
import { ProfileCard } from "./ProfileCard";
import { loadTouch } from "./touchChunk";
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
/** No touch controls this time (a failed chunk): point-and-go still drives, and the next mount retries the import. */
const NoTouch = () => null;
/** The touch controls chunk (`touchChunk.ts`, coarse pointers only): the bottom band's left column and the phone's Boost. */
const TOUCH = { input: stickInput, setJoystick, setBoost };
const touch = () =>
  loadTouch().then((m) => {
    if (!m) throw new Error("touch chunk");
    m.bindTouch(TOUCH);
    return m;
  });
const lazyTouchLeft = lazyFromChunk<{ phone: boolean; aside: boolean }>(() => touch().then((m) => m.TouchLeft), NoTouch);
const lazyPhoneBoost = lazyFromChunk<object>(() => touch().then((m) => m.PhoneBoost), NoTouch);
function LazyTouchLeft(props: { phone: boolean; aside: boolean }) {
  return <Suspense fallback={null}>{createElement(lazyTouchLeft(), props)}</Suspense>;
}
function LazyPhoneBoost() {
  return <Suspense fallback={null}>{createElement(lazyPhoneBoost())}</Suspense>;
}

const lazyHologramOverlay = lazyFromChunk<HologramOverlayProps>(() => floorChunks.load("L3").then((m) => m.HologramOverlay), HologramUnavailable);

function HologramView({ locale }: { locale: HologramOverlayProps["locale"] }) {
  const overlay = lazyHologramOverlay();
  return (
    <Suspense fallback={null}>
      {createElement(overlay, { locale })}
    </Suspense>
  );
}

/**
 * Control hints, in the bottom band's center column under point-and-go's status. Phones never show it
 * (owner decision 2026-10-24: it crowded the screen); the menu's Controls card has the same list.
 */
function HintBar({ coarse }: { coarse: boolean }) {
  const t = useTranslations("hud");
  const rail = useHQStore((s) => s.floor === "L2");
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
 * bottom on tablets). Left: the joystick and the Boost button (coarse pointers; a double tap on the
 * joystick toggles boost too).
 * Center: point-and-go's status above the controls hint. Right: on desktops the settings gear above
 * the view controls, in Corners one reset button. It hugs the bottom edge above the iOS home
 * indicator (safe area). With `aside` (a phone's docked Rover line covers the bottom) the whole band, status
 * included, is inert and faded.
 */
function BottomBand({ left, right, aside = false, children }: { left: ReactNode; right: ReactNode; aside?: boolean; children: ReactNode }) {
  return (
    <div
      data-testid="hud-bottom"
      data-aside={aside ? "true" : undefined}
      inert={aside}
      className={`pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 pr-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-5 transition-opacity motion-reduce:transition-none md:pr-4 ${aside ? "opacity-0" : ""}`}
    >
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

/** Gap the elevator rail keeps from the top bar and from the bottom-right corner stack (the corner's own gap). */
const RAIL_GAP = 8;

/**
 * Desktop: measures the room the elevator rail leaves free above (the top bar) and below (the corner
 * stack: minimap, settings gear, view controls) into `--hq-rail-top` and `--hq-rail-bottom` on the HUD
 * root. `ElevatorPanel` centres the rail between two spacers with those minimum heights, so it keeps
 * its centred spot when there is room and rises clear of the minimap on short screens. A
 * ResizeObserver follows the viewport, the minimap setting and the controls that come and go.
 */
function useRailRoom(root: RefObject<HTMLDivElement | null>, active: boolean) {
  useLayoutEffect(() => {
    const hud = root.current;
    if (!active || !hud) return;
    const bar = hud.querySelector<HTMLElement>("[data-testid='hud-topbar']");
    const corner = hud.querySelector<HTMLElement>("[data-testid='hud-corner']");
    const place = () => {
      const box = hud.getBoundingClientRect();
      if (bar) hud.style.setProperty("--hq-rail-top", `${Math.ceil(bar.getBoundingClientRect().bottom - box.top + RAIL_GAP)}px`);
      if (corner) hud.style.setProperty("--hq-rail-bottom", `${Math.ceil(box.bottom - corner.getBoundingClientRect().top + RAIL_GAP)}px`);
    };
    place();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(place) : null;
    for (const el of [hud, bar, corner]) if (el) observer?.observe(el);
    return () => {
      observer?.disconnect();
      hud.style.removeProperty("--hq-rail-top");
      hud.style.removeProperty("--hq-rail-bottom");
    };
  }, [root, active]);
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
  const docked = useDialog((v) => phone && coarse && docks(v));
  const explorable = phase !== "intro" && phase !== "room";
  const drive = coarse && phase !== "intro";
  const root = useRef<HTMLDivElement>(null);
  useRailRoom(root, desktop && phase !== "boot" && phase !== "hologram");

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
    <div ref={root} className="pointer-events-none absolute inset-0 z-10" data-testid="hud" data-phase={phase}>
      <CutFade />
      <BeamFade />
      <OfficeLayer />
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
            aside={docked}
            // Coarse pointers always get the Corners HUD: the Boost button (or a joystick double tap) toggles boost. Phones
            // drive with the floating stick (a drag in the lower-left drive zone) and keep Boost above Reset view.
            left={drive ? <LazyTouchLeft phone={phone} aside={docked} /> : null}
            right={
              desktop ? (
                <DesktopCorner data={data} layouts={layouts} explorable={explorable} />
              ) : phone && drive ? (
                <div className="flex flex-col items-end gap-3">
                  <LazyPhoneBoost />
                  {explorable && <ResetView />}
                </div>
              ) : explorable ? (
                <ResetView />
              ) : null
            }
          >
            <InteractStatus coarse={coarse} />
            {explorable && !speaking && !phone && <HintBar coarse={coarse} />}
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
