import type { Locale } from "@/content/schema";
import { sinceLabel } from "@/lib/office/model";
import type { OfficeTranslate } from "../officeLayout";
import type { OfficeRoverView, OfficeView } from "./officeModel";

const say = (r: OfficeRoverView, t: OfficeTranslate) => ({ n: r.slot + 1, agent: t(`agent.${r.agent}`), state: t(`3d.crew.state.${r.state}`) });

/** One sentence per desk for the summary drawer's screen reader crew summary (design 5.6). */
export function crewLines(view: OfficeView, t: OfficeTranslate, locale: Locale, now: number): string[] {
  return view.rovers.map((r) => (r.agent ? t("3d.crew.line", { ...say(r, t), time: r.since === null ? "none" : sinceLabel(r.since, locale, now) }) : t("3d.crew.offDuty", { n: r.slot + 1 })));
}

/** The sentences of the desks whose state changed (null when none): what the live region announces. */
export function crewAnnouncement(prev: OfficeView | null, next: OfficeView, t: OfficeTranslate): string | null {
  const changed = prev ? next.rovers.filter((r) => r.agent && prev.rovers[r.slot]?.state !== r.state) : [];
  return changed.length ? changed.map((r) => t("3d.crew.change", say(r, t))).join(" ") : null;
}
