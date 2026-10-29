"use client";

import { useTranslations } from "next-intl";
import { useHQStore } from "@/store/useHQStore";
import { useHudLayout } from "../layout";

/** Splits a controls hint ("Drive: joystick · Zoom: pinch") into label and value rows. */
export function controlRows(hint: string): { label: string; value: string }[] {
  return hint
    .split(" · ")
    .map((part) => {
      const at = part.indexOf(": ");
      return at < 0 ? { label: "", value: part.trim() } : { label: part.slice(0, at).trim(), value: part.slice(at + 2).trim() };
    })
    .filter((row) => row.value);
}

/**
 * The controls help in the menu (owner decision 2026-10-24: phones show no controls bar, so the full list lives
 * here): the same text as the bar (`hud.hintCoarse`, `hud.hintFine` with a fine pointer; `hud.hintPhone` on a phone, which
 * drives with the floating stick), one row per control,
 * plus the L2 year scrub on touch. It rides in the lazy settings chunk (`SettingsPanel` renders it first when the
 * menu passes `controls`), so it stays off the first-frame 3D path.
 */
export function MenuControls() {
  const t = useTranslations("hud");
  const coarse = useHQStore((s) => s.device.coarse);
  const rail = useHQStore((s) => s.floor === "L2");
  const phone = useHudLayout() === "phone";
  const rows = controlRows(coarse ? t(phone ? "hintPhone" : "hintCoarse") : t("hintFine"));
  return (
    <section aria-label={t("controls")} data-testid="menu-controls-card" className="rounded-xl border border-line-2 px-3 py-2">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-[13px] leading-5">
        {rows.map((row) => (
          <div key={`${row.label}-${row.value}`} className="contents">
            <dt className="text-ink">{row.label}</dt>
            <dd className="text-ink-2">{row.value}</dd>
          </div>
        ))}
      </dl>
      {coarse && rail && <p className="mt-2 text-[13px] leading-5 text-ink-2">{t("career.scrubHint")}</p>}
    </section>
  );
}
