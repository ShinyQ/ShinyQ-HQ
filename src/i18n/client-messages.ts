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
  "proto",
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
