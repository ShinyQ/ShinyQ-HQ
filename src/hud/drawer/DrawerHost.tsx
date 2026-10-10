"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { Locale, RoomId } from "@/content/schema";
import type { RoomViews } from "@/content/room-views/types";
import { READY_FLOORS } from "@/experience/config";
import { VIEW_KEY } from "@/experience/ExperienceGate";
import { goToRoom } from "@/experience/missions/bridge";
import { audio } from "@/lib/audio";
import { getHQStore, useHQStore } from "@/store/useHQStore";
import { useTranslations } from "next-intl";
import { loadRoomViews } from "./data";
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

/** Room views for the locale, loaded once (null until ready, "error" when the fetch failed). */
export function useRoomViews(locale: Locale): RoomViews | null | "error" {
  const [views, setViews] = useState<RoomViews | null | "error">(null);
  useEffect(() => {
    let live = true;
    loadRoomViews(locale).then(
      (v) => live && setViews(v),
      () => live && setViews("error"),
    );
    return () => {
      live = false;
    };
  }, [locale]);
  return views;
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
  const views = useRoomViews(locale);
  const returnFocus = useRef<HTMLElement | null>(null);
  const open = Boolean(activeRoom) && phase === "room";

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
        {views === "error" ? t("unavailable") : t("loading")}
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
        // Full pages open as pages: the gate on the next route stays in page view.
        try {
          sessionStorage.setItem(VIEW_KEY, "page");
        } catch {
          // Without storage the next page opens in 3D, which still shows the room.
        }
        leaveRoomForPage();
        getHQStore().getState().closeRoom();
      }}
    />
  );
}
