import type { Locale } from "@/content/schema";
import type { OfficeTranslate } from "../officeLayout";
import type { OfficeRoverView, OfficeView } from "./officeModel";

const say = (r: OfficeRoverView, t: OfficeTranslate) => ({ n: r.slot + 1, agent: t(`agent.${r.agent}`), state: t(`3d.crew.state.${r.state}`) });

/** One sentence per desk for the summary drawer's screen reader crew summary (design 5.6), with the clock time the state began. */
export function crewLines(view: OfficeView, t: OfficeTranslate, locale: Locale): string[] {
  const clock = new Intl.DateTimeFormat(locale, { timeStyle: "short" });
  // "none" is the ICU select sentinel that drops the ", since ..." clause (a sleeping office has no time).
  return view.rovers.map((r) => (r.agent ? t("3d.crew.line", { ...say(r, t), time: r.since === null ? "none" : clock.format(r.since) }) : t("3d.crew.offDuty", { n: r.slot + 1 })));
}

/** What the live region announces (null when nothing): one sentence for a mode change, else the desks whose state changed. */
export function crewAnnouncement(prev: OfficeView | null, next: OfficeView, t: OfficeTranslate): string | null {
  if (!prev) return null;
  if (prev.mode !== next.mode) return t(`3d.crew.mode.${next.mode}`);
  const changed = next.rovers.filter((r) => r.agent && prev.rovers[r.slot]?.state !== r.state);
  return changed.length ? changed.map((r) => t("3d.crew.change", say(r, t))).join(" ") : null;
}
