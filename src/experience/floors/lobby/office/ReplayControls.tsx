"use client";

import { useTranslations } from "next-intl";
import { useHQStore } from "@/store/useHQStore";
import { dayLabel, playable, REPLAY } from "./replay";
import { officeReplay, useReplay } from "./replayLink";

const NOTE = "text-[13px] leading-5 text-ink-2";

/**
 * The drawer's day replay controls (replay chunk, shown beside the summary panel once the visitor asks): the index's
 * days, play or pause (under reduced motion "Next hour"), a native range over the playback and the day's notes. Its own
 * chunk, loaded with the drawer's press (`loadControls`, which also fetches the index with `open()`). Existing classes
 * only (the CSS budget rides on every page).
 */
export function ReplayControls({ locale }: { locale: "en" | "id" }) {
  const t = useTranslations("office");
  const reduced = useHQStore((s) => s.reducedMotion);
  const { state } = useReplay();
  const ctl = officeReplay.controller!;
  const { status, days } = state;
  const on = status === "playing" || status === "resting" || status === "paused";
  // A rest between loops counts as playing: the button pauses it.
  const running = status === "playing" || status === "resting";
  const first = days.find(playable)?.day;
  // Never disabled while loading (the focused button would lose focus): the press does nothing then.
  const press = () => (status === "loading" ? undefined : !on ? first && ctl.play(first) : reduced ? ctl.nextHour() : running ? ctl.pause() : ctl.resume());
  return (
    <div className="grid gap-3" data-testid="office-replay">
      <div className="flex flex-wrap gap-2">
        {days.map((d) => (
          <button key={d.day} type="button" className="chip min-h-11" aria-pressed={state.day === d.day} disabled={!playable(d)} title={playable(d) ? undefined : t("3d.replay.empty")} onClick={() => void ctl.play(d.day)}>
            {dayLabel(d.day, locale)}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <button type="button" className="chip min-h-11" disabled={!first} onClick={press}>
          {t(`3d.replay.${reduced ? "nextHour" : running ? "pause" : "play"}`)}
        </button>
        <input
          type="range"
          className="w-full"
          aria-label={t("3d.replay.time")}
          aria-valuetext={t("3d.replay.timeValue", { time: state.clock })}
          min={0}
          max={Math.ceil(state.duration / REPLAY.tickS) * REPLAY.tickS}
          step={REPLAY.tickS}
          value={state.playS}
          disabled={!on}
          onChange={(e) => ctl.seek(+e.target.value)}
        />
      </div>
      {state.truncated && <p className={NOTE}>{t("3d.replay.partial")}</p>}
      {status === "unavailable" && (
        <p className={NOTE} role="status">
          {t("3d.replay.unavailable")}
        </p>
      )}
    </div>
  );
}
