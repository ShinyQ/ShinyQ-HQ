import { getTranslations } from "next-intl/server";
import { AccentDot } from "@/components/AccentDot";
import { SectionWide } from "@/components/page/Layout";
import type { Locale } from "@/content/schema";
import { TALLY_KEYS, TT_KINDS, type TtStop } from "@/content/time-travel";
import { KIND_TONE } from "./geometry";
import { Skyline } from "./Skyline";
import { TimeTravelControls } from "./TimeTravelControls";
import { YearPanel } from "./YearPanel";

export const TIME_TRAVEL_ID = "time-travel";

/** Time Travel (spec 2026-10-25): the journey as a skyline, opened on now. Server rendered; the island only enhances it. */
export async function TimeTravel({ locale, stops }: { locale: Locale; stops: readonly TtStop[] }) {
  if (stops.length === 0) return null;
  const t = await getTranslations({ locale, namespace: "timeTravel" });
  const labels = stops.map((s) => (s.year === null ? t("prologue") : String(s.year)));
  const names = stops.map((s, i) => t("building", { label: labels[i], count: s.size }));
  const last = stops.length - 1;
  const tally = Object.fromEntries(TALLY_KEYS.map((k) => [k, t(`tally.${k}`)])) as Record<(typeof TALLY_KEYS)[number], string>;

  return (
    <SectionWide id={TIME_TRAVEL_ID} title={t("title")}>
      <p className="pv-lead">{t("lead")}</p>
      <div className="mt-8">
        <Skyline stops={stops} labels={labels} names={names} title={t("skyline")} />
      </div>
      <ul className="pv-small mt-4 flex flex-wrap gap-x-5 gap-y-2">
        {TT_KINDS.map((kind) => (
          <li key={kind} className="inline-flex items-center gap-2">
            <AccentDot tone={KIND_TONE[kind]} />
            {t(`kinds.${kind}`)}
          </li>
        ))}
      </ul>
      <div className="mt-6 min-h-11">
        <TimeTravelControls rootId={TIME_TRAVEL_ID} labels={{ slider: t("slider"), play: t("play"), pause: t("pause"), stops: labels }} />
      </div>
      <div className="mt-8">
        {stops.map((stop, i) => (
          <YearPanel
            key={stop.id}
            stop={stop}
            label={labels[i]}
            hidden={i !== last}
            locale={locale}
            text={{ tally, added: (count) => t("added", { count }), highlights: t("highlights"), see: stop.year === null ? t("seePrologue") : t("seeYear", { label: labels[i] }) }}
          />
        ))}
      </div>
    </SectionWide>
  );
}
