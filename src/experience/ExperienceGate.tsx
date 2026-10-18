"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { onHudCommand } from "@/hud/events";
import { BOOT_ATTR, releaseBootCover } from "@/lib/boot-first";
import { introSeen } from "@/lib/intro-session";
import { chooseView, currentView, VIEW_EVENT } from "@/lib/view-pref";
import { b1FromHash } from "./b1";
import { opsRoomFromHash } from "./floors/labs/opsHash";
import { gateStartRoom } from "./floors/lobby/stations";
import { visitsRoomFromHash } from "./floors/lobby/visitsRoom";
import { useGateTier, useQualityTier } from "./gate-tier";
import { loadIntro } from "./intro/chunk";
import { claimAutoOpen } from "./missions/bridge";
import type { Recovery } from "./recovery";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import type { FloorId, RoomId } from "@/content/schema";
import type { ExperienceData } from "./types";

/** The 3D chunk; a session that plays the intro loads the intro chunk alongside it (Experience waits for both). */
const loadExperience = () => {
  if (typeof window !== "undefined" && !introSeen()) void loadIntro();
  return import("./Experience");
};
const Experience = dynamic(loadExperience, { ssr: false });

// Boot-first visits (html[data-hq-boot], set by the inline head script) start the 3D chunk download
// during hydration instead of after the tier probe.
if (typeof document !== "undefined" && document.documentElement.hasAttribute(BOOT_ATTR)) void loadExperience();

const onFirstFrame = () => releaseBootCover("ready");

/**
 * Decides the GPU tier on the client and lazy-loads the 3D experience on top
 * of the server-rendered page. Static tier, page view and server render all
 * leave the HTML page untouched.
 */
const loadRecovery = () => import("./recovery");

export function ExperienceGate({ data, startFloor, startRoom }: { data: ExperienceData; startFloor?: FloorId; startRoom?: RoomId }) {
  const t = useTranslations("hud");
  const detectedTier = useQualityTier(useGateTier());
  const [view, setView] = useState<"3d" | "page">(() => (typeof window === "undefined" ? "3d" : currentView()));
  // `/{locale}#highlights-<station>` opens that Highlights Hall station, `/{locale}#visits` and
  // `/{locale}/contact#visits` the Visitor Observatory in the Lobby, and `/{locale}/contact#production` the L3 Ops Control Room (read once on the client; never on other
  // floor or room routes).
  const [hashRoom] = useState<RoomId | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : (gateStartRoom(startFloor, undefined, window.location.hash) ?? visitsRoomFromHash(startFloor, window.location.hash) ?? opsRoomFromHash(startFloor, window.location.hash) ?? undefined),
  );
  // A hash room on another floor than the route's (the Ops Control Room from /contact#production, the Visitor
  // Observatory from /contact#visits) starts on its floor. L1 hash rooms start in the Lobby, which has no start
  // floor; floor ids are two characters ("L3:ops").
  // `/{locale}#B1`: the Engine Room, honoured by startSession only when unlocked (read once on the client).
  const [b1Hash] = useState(() => (typeof window === "undefined" ? undefined : b1FromHash(startFloor, window.location.hash)));
  const hashFloor = !startRoom && hashRoom ? (hashRoom.startsWith("L1:") ? undefined : (hashRoom.slice(0, 2) as FloorId)) : (b1Hash ?? startFloor);
  // WebGL context loss or a crash: one automatic remount on a fresh canvas, then the static page with "Retry 3D".
  // The state machine loads on the first crash only, so it stays out of every page's initial JS.
  const [recovery, setRecovery] = useState<Recovery>({ failures: 0, status: "ok" });
  const [mount, setMount] = useState(0);
  const onCrash = useCallback(() => void loadRecovery().then((r) => setRecovery(r.afterFailure)), []);
  const retry3D = useCallback(() => void loadRecovery().then((r) => setRecovery(r.manualRetry)), []);
  const lost = useHQStore((s) => s.phase === "static" && s.tier === "static");
  const tier = detectedTier === null ? null : lost ? "static" : detectedTier;
  const back3D = useCallback(() => {
    chooseView("3d");
    setView("3d");
  }, []);
  // Page View from the HUD, or from the boot card's "Classic site" link (cover or overlay).
  const toPage = useCallback(() => {
    chooseView("page");
    setView("page");
    // Hand focus to the page content; the Back to 3D button is the first stop on Tab.
    window.requestAnimationFrame(() => document.getElementById("main")?.focus({ preventScroll: true }));
  }, []);
  const immersive = tier !== null && tier !== "static" && view === "3d";

  // The boot card's "Classic site" is a real `?view=classic` link (works before hydration); once hydrated, switch without a reload.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (!(e.target instanceof Element) || !e.target.closest("[data-hq-page-link]")) return;
      e.preventDefault();
      toPage();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [toPage]);

  // The tab's view changed elsewhere (the drawer's page link on this same route).
  useEffect(() => {
    const onView = () => setView(currentView());
    window.addEventListener(VIEW_EVENT, onView);
    return () => window.removeEventListener(VIEW_EVENT, onView);
  }, []);

  // The boot cover hides the page until 3D draws its first frame; reveal the page when 3D is off.
  useEffect(() => {
    if (tier === "static") releaseBootCover("static");
    else if (tier && view === "page") releaseBootCover("page");
  }, [tier, view]);

  // Lets the Director open the Rover Terminal after the intro only while the tower is open; the Page View never auto-opens it.
  useEffect(() => {
    claimAutoOpen(immersive);
    return () => claimAutoOpen(false);
  }, [immersive]);

  useEffect(() => {
    if (recovery.status === "failed") {
      getHQStore().getState().setTier("static");
      return;
    }
    if (recovery.status !== "retrying" || !detectedTier || detectedTier === "static") return;
    // Remount once the tab is visible again (iOS drops background contexts), on a fresh canvas.
    let live = true;
    let cancel: (() => void) | undefined;
    void loadRecovery().then((r) => {
      if (!live) return;
      cancel = r.whenVisible(() => {
        getHQStore().getState().recover(detectedTier);
        setMount((m) => m + 1);
        setRecovery(r.settled);
      });
    });
    return () => {
      live = false;
      cancel?.();
    };
  }, [recovery.status, detectedTier]);

  // The landing's "Enter the 3D HQ" (EnterHqButton) asks for the tower the same way Back to 3D does.
  useEffect(
    () =>
      onHudCommand((command) => {
        if (command.type === "enter3d") back3D();
      }),
    [back3D],
  );

  if (!tier) return null;

  // Between a crash and the remount: cover the page so the HTML does not flash under the dead canvas.
  if (recovery.status === "retrying") return createPortal(<div aria-hidden="true" className="fixed inset-0 z-[35] bg-void" />, document.body);

  if (lost) {
    return (
      <div role="status" className="glass no-print fixed right-4 bottom-4 z-40 flex items-center gap-3 px-4 py-3 text-sm text-ink">
        <span>{t("staticNotice")}</span>
        <button
          type="button"
          onClick={retry3D}
          data-testid="retry-3d"
          className="min-h-11 shrink-0 rounded-full bg-cyan px-4 font-semibold text-void transition hover:bg-cyan/85 focus-visible:outline-offset-4"
        >
          {t("retry3d")}
        </button>
      </div>
    );
  }
  if (tier === "static") return null;

  if (view === "page") return <BackTo3D onBack={back3D} label={t("back3d")} hint={t("back3dHint")} />;

  return createPortal(
    <Experience
      key={`${mount}:${tier}`}
      data={data}
      tier={tier}
      startFloor={hashFloor}
      startRoom={startRoom ?? hashRoom}
      onFirstFrame={onFirstFrame}
      onCrash={onCrash}
      onExit={toPage}
    />,
    document.body,
  );
}

/**
 * Classic site's way back: a fixed, solid cyan button in the bottom-right corner, visible without
 * scrolling on every viewport. It is the first focusable element in <main>, and the `3` key
 * triggers it too.
 */
function BackTo3D({ onBack, label, hint }: { onBack: () => void; label: string; hint: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "3" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "")) return;
      if (document.querySelector("[role='dialog'][aria-modal='true']")) return;
      e.preventDefault();
      onBack();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onBack]);

  return (
    <button
      type="button"
      onClick={onBack}
      title={hint}
      aria-keyshortcuts="3"
      data-testid="back-to-3d"
      className="no-print fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 inline-flex min-h-12 items-center gap-2.5 rounded-full bg-cyan px-5 font-semibold text-void shadow-[0_0_32px_-4px_var(--color-cyan)] transition hover:bg-cyan/85 focus-visible:outline-offset-4 sm:right-6 sm:bottom-6 sm:min-h-14 sm:px-6 sm:text-[17px]"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 2 3 7v10l9 5 9-5V7l-9-5z" />
        <path d="M3 7l9 5 9-5M12 12v10" />
      </svg>
      {label}
      <kbd aria-hidden="true" className="label hidden rounded border border-void/30 px-1.5 py-0.5 text-void/80 sm:inline">
        3
      </kbd>
    </button>
  );
}
