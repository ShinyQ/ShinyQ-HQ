import { decideView, normalizeViewSearch, VIEW_KEY, type ViewChoice } from "./view-param";

/** Fired on window when this tab switches between the Classic site and 3D. */
export const VIEW_EVENT = "hq:view";
/** Fired on window when the remembered preference changes ("Open links in"). */
export const PREF_EVENT = "hq:view-pref";

const get = (s: () => Storage) => {
  try {
    return s().getItem(VIEW_KEY);
  } catch {
    return null;
  }
};
const put = (s: () => Storage, v: ViewChoice) => {
  try {
    s().setItem(VIEW_KEY, v);
  } catch {
    // Storage can be unavailable; the view still switches for this render.
  }
};
const session = () => window.sessionStorage;
const local = () => window.localStorage;

export function currentView(): ViewChoice {
  const view = decideView(window.location.search, get(session), get(local)).view;
  put(session, view);
  return view;
}

export function syncViewUrl(view: ViewChoice = currentView()): void {
  const { pathname, search, hash } = window.location;
  const next = normalizeViewSearch(search, view);
  if (next !== search) window.history.replaceState(window.history.state, "", pathname + next + hash);
}

export function chooseView(view: ViewChoice): void {
  put(session, view);
  put(local, view);
  syncViewUrl(view);
  window.dispatchEvent(new Event(VIEW_EVENT));
  window.dispatchEvent(new Event(PREF_EVENT));
}

/**
 * Sets this tab's view without touching the remembered preference (the drawer's page links). With `now`,
 * the URL and the mounted gate switch at once: used when the link stays on the route already mounted.
 */
export function setTabView(view: ViewChoice, { now = false }: { now?: boolean } = {}): void {
  put(session, view);
  if (!now) return;
  syncViewUrl(view);
  window.dispatchEvent(new Event(VIEW_EVENT));
}

export function getViewPreference(): ViewChoice | null {
  const v = get(local);
  return v === "page" || v === "3d" ? v : null;
}

export function setViewPreference(view: ViewChoice): void {
  put(local, view);
  window.dispatchEvent(new Event(PREF_EVENT));
}

export function subscribeViewPreference(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === VIEW_KEY && e.storageArea === window.localStorage) listener();
  };
  window.addEventListener(PREF_EVENT, listener);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(PREF_EVENT, listener);
    window.removeEventListener("storage", onStorage);
  };
}
