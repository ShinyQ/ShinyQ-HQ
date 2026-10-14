"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { READY_FLOORS } from "@/experience/config";
import type { ExperienceData } from "@/experience/types";
import { Link } from "@/i18n/navigation";
import { useHQStore } from "@/store/useHQStore";
import { useAskPanelOpen } from "./ask/availability";
import { BoostButton } from "./BoostButton";
import { BootOverlay } from "./BootOverlay";
// Rover's dialog rides in the 3D chunk (itself lazy): a second dynamic import here made Turbopack
// regroup shared modules into Page View chunks (+7 KB JS on every page, over the Lighthouse budget).
import DialogLayer from "./dialog/DialogLayer";
import { HintLayer } from "./dialog/HintLayer";
import { OnboardingLayer } from "./dialog/OnboardingLayer";
import { firstName } from "./dialog/onboarding";
import { useDialog } from "./dialog/store";
import { DrawerHost } from "./drawer/DrawerHost";
import { drawerLayout } from "./drawer/layout";
import { HologramOverlay } from "./HologramOverlay";
import { InteractStatus } from "./InteractStatus";
import { MobileMenu, TopBar } from "./Controls";
import { ElevatorPanel } from "./ElevatorPanel";
import { BeamFade, PadPicker } from "./pads/PadPicker";
import { Joystick } from "./Joystick";
import { ProfileCard } from "./ProfileCard";
import { ViewControls } from "./ViewControls";
import type { WalkPlacement } from "./walk/WalkBar";
import { WalkLayer } from "./walk/WalkLayer";
import { YearChip } from "./YearChip";

/** Control hints, in the bottom band's center column under the walk pill. */
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
 * Bottom HUD band: one flex row, so nothing in it can overlap (owner request: the hint and the walk
 * pill sit at the bottom on tablets and phones). Left: the joystick and the boost button (coarse
 * pointers; phones stack the boost button above the joystick). Center: the walk pill (WalkBar
 * portals it into `slotRef`) above the controls hint. Right: the view controls (vertical on phones).
 * It hugs the bottom edge above the iOS home indicator (safe area).
 */
function BottomBand({ left, right, children, slotRef }: { left: ReactNode; right: ReactNode; children: ReactNode; slotRef: (node: HTMLDivElement | null) => void }) {
  return (
    <div data-testid="hud-bottom" className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end gap-3 pr-2 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-5 md:pr-4">
      <div className="flex shrink-0 flex-col-reverse items-end gap-3 sm:flex-1 sm:flex-row sm:items-center">{left}</div>
      <div ref={slotRef} data-testid="hud-bottom-center" className="flex min-w-0 flex-1 flex-col items-center justify-end gap-2 sm:flex-initial">
        {children}
      </div>
      <div className="flex shrink-0 justify-end sm:flex-1">{right}</div>
    </div>
  );
}

/** HTML HUD over the canvas. It talks to the scene only through the store and intents. */
export function Hud({ data, onExit, onToggleLang }: { data: ExperienceData; onExit: () => void; onToggleLang: () => void }) {
  const phase = useHQStore((s) => s.phase);
  const viewport = useHQStore((s) => s.device.viewport);
  const coarse = useHQStore((s) => s.device.coarse);
  const mobile = viewport === "mobile";
  const [walking, setWalking] = useState(false);
  const [bottomSlot, setBottomSlot] = useState<HTMLDivElement | null>(null);
  const askOpen = useAskPanelOpen();
  const speaking = useDialog((v) => v.line !== null);
  // The room drawer and the Ask panel cover the bottom band (sheets) or the right side (side panels):
  // the Walk HUD then docks beside the side panel or goes under the top controls. Otherwise its pills
  // join the bottom band, and its card sits above the band (coarse) or at the bottom (fine pointers).
  const side = typeof window !== "undefined" && drawerLayout(window.innerWidth, window.innerHeight) === "side";
  const covered = phase === "room" || askOpen;
  const walkPlacement: WalkPlacement = covered ? (side ? "dock" : "top") : mobile ? "top" : coarse ? "bottom-raised" : "bottom";
  const explorable = phase !== "intro" && phase !== "room";

  return (
    <div className="pointer-events-none absolute inset-0 z-10" data-testid="hud" data-phase={phase}>
      <CutFade />
      <BeamFade />
      {phase === "boot" ? (
        <BootOverlay
          monogram={data.profile.monogram}
          who={{ name: data.profile.name, headline: data.profile.headline, motto: data.profile.motto, role: data.profile.role }}
        />
      ) : phase === "hologram" ? (
        // The hologram view owns the screen: only its own controls show.
        <HologramOverlay locale={data.locale} />
      ) : (
        <>
          <ProfileCard data={data} mobile={mobile} />
          {mobile ? <MobileMenu onExit={onExit} onToggleLang={onToggleLang} /> : <TopBar onExit={onExit} onToggleLang={onToggleLang} />}
          <ElevatorPanel data={data} compact={mobile} />
          <FloorNotice data={data} mobile={mobile} />
          {phase !== "intro" && <YearChip career={data.career} mobile={mobile} hidden={mobile && (walking || phase === "room")} />}
          <BottomBand
            slotRef={setBottomSlot}
            left={
              coarse && phase !== "intro" ? (
                <>
                  <Joystick />
                  <BoostButton />
                </>
              ) : null
            }
            right={explorable ? <ViewControls /> : null}
          >
            <InteractStatus coarse={coarse} />
            {explorable && !walking && !speaking && <HintBar coarse={coarse} mobile={mobile} />}
          </BottomBand>
          <DrawerHost locale={data.locale} />
        </>
      )}
      {/* Mounted in every phase so a walk keeps its state through the hologram view. */}
      <WalkLayer
        data={data}
        placement={walkPlacement}
        bottomSlot={covered ? null : bottomSlot}
        coarse={coarse}
        hidden={phase === "boot" || phase === "intro" || phase === "hologram"}
        onActive={setWalking}
      />
      <FloorAnnouncer data={data} />
      <OnboardingLayer data={data} />
      <HintLayer suppressed={walking} name={firstName(data.profile.name)} />
      {speaking && <DialogLayer />}
      <PadPicker data={data} />
    </div>
  );
}
