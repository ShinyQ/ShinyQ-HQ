"use client";

import { useLocale } from "next-intl";
import type { MouseEvent } from "react";
import { useGateTier } from "@/experience/gate-tier";
import { enterHq } from "@/hud/events";

/**
 * "Enter the 3D HQ" on the landing. CSS shows it only under html[data-hq-3d] (WebGL2, no Save-Data,
 * not a bot, no ?tier=static), which the head script sets before first paint, so it never appears late.
 * Once the probe found 3D, a click opens the tower in place (ExperienceGate handles `enter3d`). On the
 * static tier (software renderer) and before hydration it is a plain link that forces the lite tier
 * on a full page load. Modifier clicks keep the native link.
 */
export function EnterHqButton({ label, hint }: { label: string; hint: string }) {
  const locale = useLocale();
  const tier = useGateTier();
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (tier === "static") return;
    event.preventDefault();
    enterHq();
  };
  return (
    <a href={`/${locale}?tier=lite`} onClick={onClick} title={hint} className="pv-btn hx-enter" data-testid="enter-hq" data-hq-view="3d">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M12 2 3 7v10l9 5 9-5V7l-9-5z" />
        <path d="M3 7l9 5 9-5M12 12v10" />
      </svg>
      {label}
    </a>
  );
}
