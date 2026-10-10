"use client";

import { useSyncExternalStore } from "react";
import { withParams } from "@/content/pageview";

const EVENT = "hq:filter";

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("popstate", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("popstate", onChange);
  };
}

const readSearch = () => window.location.search;
const serverSearch = () => "";

/** The query string as filter state: shareable, reload-safe, and empty during the server render. */
export function useSearch() {
  return useSyncExternalStore(subscribe, readSearch, serverSearch);
}

/** Replaces filter params in place (no history entry) and keeps the others, such as `?tier=`. */
export function setSearchParams(values: Record<string, string | null>) {
  const search = withParams(window.location.search, values);
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${search}${window.location.hash}`);
  window.dispatchEvent(new Event(EVENT));
}
