import type { FloorId, Locale, RoomId } from "@/content/schema";
import { parseHQUrl, serializeHQUrl, type HQView } from "@/lib/url-sync";

/** Minimal store surface (the real zustand store satisfies it). */
export interface RoomUrlStore {
  getState(): {
    floor: FloorId;
    phase: string;
    activeRoom: RoomId | null;
    openRoom: (room: RoomId) => void;
    closeRoom: () => void;
    openHologram: () => void;
    closeHologram: () => void;
  };
  subscribe(listener: (state: ReturnType<RoomUrlStore["getState"]>, prev: ReturnType<RoomUrlStore["getState"]>) => void): () => void;
}

export interface UrlEnv {
  history: Pick<History, "pushState" | "replaceState" | "back" | "state">;
  location: { pathname: string; search: string };
  onPopState: (listener: () => void) => () => void;
}

interface RoomEntry {
  hqRoom: RoomId | null;
  /** The entry was pushed by opening a room, so closing it can go back instead of adding history. */
  hqPushed?: boolean;
}

/** Keeps the query (e.g. `?tier=lite`) and sets or removes `view=architecture`. */
export function withView(path: string, search: string, view: HQView): string {
  const params = new URLSearchParams(search);
  params.delete("view");
  if (view) params.set("view", view);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Mirrors the open room in the URL (appendix 06 section 3): opening pushes the room URL, switching
 * rooms and toggling the hologram replace it, closing goes back to the floor entry it came from (or
 * replaces the URL when the room was the landing page). Back and forward reopen or close rooms on
 * the current floor. Returns a disposer.
 */
export function createRoomUrlSync({
  store,
  locale,
  env,
  isReady,
  hasPage = () => true,
}: {
  store: RoomUrlStore;
  locale: Locale;
  env: UrlEnv;
  isReady: (floor: FloorId) => boolean;
  /** Rooms without their own route (L4 shelves, Medium posts) keep the floor URL while open. */
  hasPage?: (room: RoomId) => boolean;
}): () => void {
  let applying = false;
  let pendingBack = false;
  const viewOf = (phase: string): HQView => (phase === "hologram" ? "architecture" : null);
  const urlFor = (floor: FloorId, room: RoomId | null, view: HQView) =>
    withView(serializeHQUrl({ locale, floor: isReady(floor) ? floor : "L1", activeRoom: room && hasPage(room) ? room : null, view: null }), env.location.search, view);
  const entry = () => (env.history.state as RoomEntry | null) ?? null;
  const write = (mode: "push" | "replace", url: string, room: RoomId | null) => {
    const current = `${env.location.pathname}${env.location.search}`;
    if (mode === "replace" && current === url && entry()?.hqRoom === room) return;
    const base = (env.history.state as object | null) ?? {};
    if (mode === "push") env.history.pushState({ ...base, hqRoom: room, hqPushed: true } satisfies RoomEntry, "", url);
    else env.history.replaceState({ ...base, hqRoom: room } satisfies RoomEntry, "", url);
  };
  const resync = () => {
    const s = store.getState();
    write("replace", urlFor(s.floor, s.activeRoom, viewOf(s.phase)), s.activeRoom);
  };

  const off = store.subscribe((s, prev) => {
    if (applying) return;
    const view = viewOf(s.phase);
    if (s.activeRoom === prev.activeRoom && view === viewOf(prev.phase)) return;
    // While a back() is in flight, only replace; the popstate handler resyncs afterwards.
    if (s.activeRoom && !prev.activeRoom && !pendingBack) write("push", urlFor(s.floor, s.activeRoom, view), s.activeRoom);
    else if (s.activeRoom) write("replace", urlFor(s.floor, s.activeRoom, view), s.activeRoom);
    else if (prev.activeRoom && s.floor === prev.floor) {
      const top = entry();
      if (top?.hqPushed && top.hqRoom === prev.activeRoom && !pendingBack) {
        pendingBack = true;
        env.history.back();
      } else write("replace", urlFor(s.floor, null, null), null);
    }
  });

  const offPop = env.onPopState(() => {
    if (pendingBack) {
      // Our own back() after closing a room: the store is already right; fix the URL if it moved on.
      pendingBack = false;
      resync();
      return;
    }
    const parsed = parseHQUrl(env.location.pathname, env.location.search);
    const s = store.getState();
    if (!parsed) return;
    if (parsed.floor !== (isReady(s.floor) ? s.floor : "L1")) {
      // History from another floor: keep the URL on the floor the rover is on.
      resync();
      return;
    }
    applying = true;
    try {
      // Rooms without their own route are remembered in the history entry instead of the URL.
      const remembered = entry()?.hqRoom ?? null;
      const room =
        parsed.activeRoom && parsed.floor === s.floor ? parsed.activeRoom : remembered && remembered.startsWith(`${s.floor}:`) && !hasPage(remembered) ? remembered : null;
      if (room && room !== s.activeRoom) s.openRoom(room);
      else if (!room && s.activeRoom) s.closeRoom();
      const now = store.getState();
      if (now.activeRoom && parsed.view === "architecture" && now.phase !== "hologram") now.openHologram();
      else if (parsed.view !== "architecture" && now.phase === "hologram") now.closeHologram();
    } finally {
      applying = false;
    }
  });

  return () => {
    off();
    offPop();
  };
}
