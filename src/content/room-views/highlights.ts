import { formatPeriod } from "@/lib/format";
import { HIGHLIGHT_STAT_COUNT, highlightRoom } from "@/experience/floors/lobby/stations";
import { highlightEntries, highlightProjects } from "../highlights";
import { getProfile, getRoof, getStats, getTimeline } from "../load";
import { coverImage } from "../media";
import type { Locale, TimelineEntry } from "../schema";
import { podLiveLink } from "../selectors";
import { contactItems, cvItems } from "./roof";
import { chain, fill, messages, roomId, single } from "./shared";
import type { RoomCard, RoomView } from "./types";

/**
 * L1 Highlights Hall: the four stations behind the certification wall. About me (name, headline,
 * the first stats, the one-line intro), the landing's three featured projects, every employment and
 * freelance role newest first, and contact with the CV. Cards ride to their room (`HighlightsBody`).
 */
export function buildHighlightsViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const profile = getProfile();
  const roof = getRoof();
  const { employment, freelance } = highlightEntries(getTimeline());
  const role =
    (group: string) =>
    (e: TimelineEntry): RoomCard => ({
      room: roomId("L2", e.slug),
      title: e.role[locale],
      subtitle: e.org,
      meta: formatPeriod(e.start, e.end, locale),
      group,
      type: e.type,
    });
  return chain([
    single({
      id: highlightRoom("about"),
      kind: "highlights",
      title: profile.name,
      subtitle: profile.headline[locale],
      meta: [`${profile.currentRole.title[locale]} · ${profile.currentRole.org}`, profile.location[locale]],
      accent: "green",
      metrics: getStats()
        .slice(0, HIGHLIGHT_STAT_COUNT)
        .map((s) => ({ value: s.value, label: s.label[locale] })),
      sections: [{ body: profile.subheadline[locale] }],
      link: { room: roomId("L1", "profile"), label: m.hall.fullProfile },
      page: "/#intro",
    }),
    single({
      id: highlightRoom("projects"),
      kind: "highlights",
      title: m.hall.projects,
      subtitle: m.hall.projectsSub,
      accent: "violet",
      cards: highlightProjects().map((pod) => ({
        room: roomId("L3", pod.slug),
        title: pod.title[locale],
        subtitle: pod.tagline[locale],
        meta: m.common.wing[pod.wing],
        image: coverImage(pod.assets, locale),
        live: podLiveLink(pod)?.href,
      })),
      page: "/labs",
    }),
    single({
      id: highlightRoom("experience"),
      kind: "highlights",
      title: m.hall.experience,
      subtitle: fill(m.hall.counts, { employment: String(employment.length), freelance: String(freelance.length) }),
      accent: "amber",
      cards: [...employment.map(role(m.common.type.job)), ...freelance.map(role(m.common.type.freelance))],
      page: "/journey",
    }),
    single({
      id: highlightRoom("contact"),
      kind: "highlights",
      title: m.hall.contact,
      subtitle: roof.availability[locale],
      meta: [profile.location[locale], profile.timezone],
      accent: "blue",
      sections: [
        { title: m.drawer.rooms.channels, items: contactItems(locale) },
        { title: m.drawer.rooms.downloads, items: cvItems(locale) },
      ],
      page: "/contact",
    }),
  ]);
}
