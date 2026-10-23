import type { AbstractIntlMessages } from "next-intl";

/**
 * Message namespaces that client components read (`useTranslations` in modules reachable from a
 * "use client" file). Only these are serialized into a page's RSC payload; server-only namespaces
 * (`seo`, `meta`, `nav`, `footer`, ...) stay on the server.
 * `tests/unit/client-namespaces.test.ts` keeps both lists exact.
 */
export const CLIENT_NAMESPACES = [
  "ask",
  "certs",
  "common",
  "contact",
  "cv",
  "dialog",
  "drawer",
  "engine",
  "floors",
  "gallery",
  "hall",
  "home",
  "hud",
  "journey",
  "labs",
  "library",
  "office",
  "paper",
  "production",
  "stats",
  "work",
] as const;

/**
 * What the locale layout's client islands read (MissionHud, AskDock, DialogHost, header and footer
 * islands), as namespaces or dotted sub-paths: the layout's islands read only four parts of `hud` and the menu
 * part of `dialog`, so the rest (settings, pads, rooms, the onboarding and floor dialogs: the 3D HUD) stays off
 * every Classic page. The layout provider passes
 * only these; pages whose client islands need more (the 3D gate and Page View islands) wrap their content
 * in `ClientMessages`, which passes all of CLIENT_NAMESPACES. A nested provider replaces the parent's
 * messages, it does not merge them.
 */
export const LAYOUT_NAMESPACES = [
  "ask",
  "certs",
  "cv",
  "dialog.menu",
  "floors",
  "hud.launcher",
  "hud.palette",
  "hud.status",
  "hud.terminal",
  "paper",
] as const;

/**
 * Namespaces whose lazy dialog fetches them with its data and passes them through its own nested
 * `NextIntlClientProvider`: the study guide dialog reads `guides` from `/data/guides/{locale}.json`. The layout and
 * the pages reach such a dialog through `DialogHost` without carrying the namespace, so it joins neither
 * LAYOUT_NAMESPACES nor CLIENT_NAMESPACES (server components such as the `/library` shelf read it with
 * `getTranslations`). The namespace test exempts only the fetching files (its `FETCHING_FILES`), never the whole
 * namespace: any other client island that reads it must add it back to CLIENT_NAMESPACES and use `ClientMessages`.
 */
export const FETCHED_NAMESPACES = ["guides"] as const;

/**
 * Dotted sub-paths of a CLIENT_NAMESPACES namespace that only server components read and pass on as resolved props
 * (the Classic office card's `office.classic`): `ClientMessages` drops them, so they never ride in a page's RSC payload.
 */
export const SERVER_PATHS = ["office.classic"] as const;

/** A copy without the dotted paths; only the objects along a path are copied, everything else stays the same object. */
export function omitMessages(messages: AbstractIntlMessages, paths: readonly string[]): AbstractIntlMessages {
  const out: AbstractIntlMessages = { ...messages };
  for (const path of paths) {
    const keys = path.split(".");
    let into: AbstractIntlMessages | null = out;
    for (let i = 0; i < keys.length - 1 && into; i++) {
      const next: AbstractIntlMessages[string] | undefined = into[keys[i]];
      into = typeof next === "object" ? (into[keys[i]] = { ...next }) : null;
    }
    if (into) delete into[keys[keys.length - 1]];
  }
  return out;
}

/** Picks top-level namespaces or dotted sub-paths (`hud.palette`), keeping the nesting and the original objects. */
export function pickMessages(messages: AbstractIntlMessages, paths: readonly string[]): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const path of paths) {
    const keys = path.split(".");
    let from: AbstractIntlMessages | string | undefined = messages;
    let into = picked;
    for (let i = 0; i < keys.length && from !== undefined; i++) {
      const key = keys[i];
      if (typeof from !== "object" || !(key in from)) {
        from = undefined;
        break;
      }
      from = from[key];
      if (i === keys.length - 1) into[key] = from;
      else into = (into[key] ??= {}) as AbstractIntlMessages;
    }
  }
  return picked;
}
