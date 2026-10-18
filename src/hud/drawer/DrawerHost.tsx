"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Locale, RoomId } from "@/content/schema";
import type { RoomViews } from "@/content/room-views/types";
import { afterFirstFrameIdle } from "@/experience/boot-signals";
import { READY_FLOORS } from "@/experience/config";
import { goToRoom } from "@/experience/missions/bridge";
import { useAskPanelOpen } from "@/hud/ask/availability";
import { audio } from "@/lib/audio";
import { setTabView } from "@/lib/view-pref";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { useTranslations } from "next-intl";
import { loadEngineViews, loadRoomViews } from "./data";
import { drawerLayout } from "./layout";
import { RoomDrawer } from "./RoomDrawer";
import { createRoomUrlSync, leaveRoomForPage } from "./urlSync";

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** Side panel or bottom sheet for the current window size. */
export function useDrawerLayout() {
  return useSyncExternalStore(
    subscribeResize,
    () => drawerLayout(window.innerWidth, window.innerHeight),
    () => "side" as const,
  );
}

function useLoadedViews(load: (locale: Locale) => Promise<RoomViews>, locale: Locale, wanted: boolean): RoomViews | null | "error" {
  const [views, setViews] = useState<RoomViews | null | "error">(null);
  useEffect(() => {
    if (!wanted) return;
    let live = true;
    load(locale).then(
      (v) => live && setViews(v),
      () => live && setViews("error"),
    );
    return () => {
      live = false;
    };
  }, [load, locale, wanted]);
  return views;
}

/** Room views for the locale, loaded once when `wanted` (null until ready, "error" when the fetch failed). */
export function useRoomViews(locale: Locale, wanted = true): RoomViews | null | "error" {
  return useLoadedViews(loadRoomViews, locale, wanted);
}

/** The B1 Engine Room views (their own file), loaded once when `wanted`. */
export function useEngineViews(locale: Locale, wanted: boolean): RoomViews | null | "error" {
  return useLoadedViews(loadEngineViews, locale, wanted);
}

const trim = (path: string) => (path.length > 1 ? path.replace(/\/$/, "") : path);

/** True when `href` (root-relative, may carry a hash) points at the current pathname. */
function samePath(href: string): boolean {
  return trim(href.split("#")[0]) === trim(window.location.pathname);
}

/** True once the first 3D frame rendered and the main thread went idle (quiet boot, REPORT SP3). */
function useAfterFirstFrameIdle(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => afterFirstFrameIdle(() => setReady(true)), []);
  return ready;
}

/** Mirrors the open room in the URL while the tower is open (mounted by Experience, outside the HUD phases). */
export function useRoomUrlSync(locale: Locale, hasPage?: (room: RoomId) => boolean) {
  useEffect(
    () =>
      createRoomUrlSync({
        store: getHQStore(),
        locale,
        env: {
          history: window.history,
          location: window.location,
          onPopState: (listener) => {
            window.addEventListener("popstate", listener);
            return () => window.removeEventListener("popstate", listener);
          },
        },
        isReady: (floor) => READY_FLOORS.includes(floor),
        hasPage,
      }),
    [locale, hasPage],
  );
}

/**
 * Connects the Glass Drawer to the store (activeRoom, tab, README), the room data and audio.
 * Mounted once by the 3D HUD; every floor's rooms render through it.
 */
export function DrawerHost({ locale }: { locale: Locale }) {
  const t = useTranslations("drawer");
  const activeRoom = useHQStore((s) => s.activeRoom);
  const phase = useHQStore((s) => s.phase);
  const tab = useHQStore((s) => s.drawerTab);
  const readme = useHQStore((s) => s.readme);
  const layout = useDrawerLayout();
  const askOpen = useAskPanelOpen();
  const open = Boolean(activeRoom) && phase === "room";
  const idle = useAfterFirstFrameIdle();
  // Room data waits for the first frame and an idle moment, unless a room opens first (deep links).
  const shared = useRoomViews(locale, open || idle);
  // The secret B1 drawers are a separate file: locked sessions never fetch it.
  const b1Unlocked = useHQStore((s) => s.b1Unlocked);
  const b1Room = Boolean(activeRoom?.startsWith("B1:"));
  const engine = useEngineViews(locale, b1Room || (b1Unlocked && (open || idle)));
  const views = useMemo(() => {
    if (!engine || engine === "error") return shared;
    if (shared && shared !== "error") return { ...shared, ...engine };
    return b1Room ? engine : shared;
  }, [shared, engine, b1Room]);
  const returnFocus = useRef<HTMLElement | null>(null);

  // Esc closes the open room from the moment the store opens it: while its data loads (the loading card)
  // and before the Glass Drawer has mounted its own handler. Read at key time, so it never waits on React.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      const s = getHQStore().getState();
      if (!s.activeRoom || s.phase !== "room") return;
      const drawer = document.querySelector("[data-testid='room-drawer']");
      if ([...document.querySelectorAll("[role='dialog'][aria-modal='true']")].some((d) => d !== drawer)) return;
      event.preventDefault();
      s.closeRoom();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Whoosh on open and close; focus returns to the world when the drawer closes.
  useEffect(() => {
    if (open) {
      audio.play("whoosh");
      const active = document.activeElement;
      if (active instanceof HTMLElement && !active.closest("[data-testid='room-drawer']")) returnFocus.current = active;
      return () => {
        audio.play("whoosh");
        const target = returnFocus.current?.isConnected ? returnFocus.current : document.querySelector<HTMLElement>("[data-testid='hq-world']");
        if (!document.querySelector("[role='dialog'][aria-modal='true']")) target?.focus({ preventScroll: true });
      };
    }
  }, [open]);

  const view = activeRoom && views && views !== "error" ? views[activeRoom] : undefined;
  const neighbours = useMemo(() => {
    if (!view || !views || views === "error") return undefined;
    return { prev: view.prev ? views[view.prev]?.title : undefined, next: view.next ? views[view.next]?.title : undefined };
  }, [view, views]);

  if (!open || !activeRoom) return null;
  const s = getHQStore().getState();

  if (!view) {
    return (
      <div role="status" className="glass glass-solid pointer-events-auto absolute right-4 bottom-4 z-20 flex items-center gap-3 px-4 py-3 text-sm text-ink-2" data-testid="room-drawer-status">
        {views === "error" || (b1Room && engine === "error") ? t("unavailable") : t("loading")}
        <button type="button" onClick={() => s.closeRoom()} className="link min-h-11">
          {t("close")}
        </button>
      </div>
    );
  }

  return (
    <RoomDrawer
      view={view}
      locale={locale}
      layout={layout}
      tab={tab}
      readme={readme}
      neighbours={neighbours}
      narrow={layout === "side" && askOpen}
      onTab={(next) => getHQStore().getState().setDrawerTab(next)}
      onToggleReadme={() => getHQStore().getState().toggleReadme()}
      onClose={() => getHQStore().getState().closeRoom()}
      onNavigate={(room: RoomId) => getHQStore().getState().openRoom(room)}
      onHologram={() => getHQStore().getState().openHologram()}
      onLink={(room) => {
        getHQStore().getState().closeRoom();
        goToRoom(room);
      }}
      onLeave={() => {
        // Full pages open as pages: the gate on the next route stays in page view. A page on the route
        // already mounted (the room's own URL) does not remount the gate, so it switches now.
        setTabView("page", { now: view.page !== undefined && samePath(`/${locale}${view.page}`) });
        leaveRoomForPage();
        getHQStore().getState().closeRoom();
      }}
    />
  );
}
