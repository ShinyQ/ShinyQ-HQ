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
  "paper",
  "production",
  "proto",
  "stats",
  "work",
] as const;

/**
 * What the locale layout's client islands read (MissionHud, AskDock, DialogHost, header and footer
 * islands). The layout provider passes only these; pages whose client islands need more (the 3D
 * gate and Page View islands) wrap their content in `ClientMessages`, which passes all of
 * CLIENT_NAMESPACES. A nested provider replaces the parent's messages, it does not merge them.
 */
export const LAYOUT_NAMESPACES = ["ask", "certs", "cv", "dialog", "floors", "hud", "paper"] as const;

export function pickMessages(messages: AbstractIntlMessages, namespaces: readonly string[]): AbstractIntlMessages {
  const picked: AbstractIntlMessages = {};
  for (const ns of namespaces) if (ns in messages) picked[ns] = messages[ns];
  return picked;
}
