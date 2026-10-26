import { sortCertifications } from "../certs";
import { getCertifications, getProfile, getSkills, getStats } from "../load";
import type { Locale } from "../schema";
import { formatYearMonth } from "@/lib/format";
import { visitsLabels } from "@/lib/visits/labels";
import { OFFICE_SEATS } from "@/lib/office/protocol";
import { chain, fill, logoChips, messages, roomId, single } from "./shared";
import type { RoomView } from "./types";

/** L1 Lobby: profile hologram, stats ring, skills wall, certifications wall and the Visitor Observatory (`VisitsBody`). */
export function buildLobbyViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const profile = getProfile();
  const lobby = chain([
    single({
      id: roomId("L1", "profile"),
      kind: "lobby",
      title: profile.name,
      subtitle: profile.headline[locale],
      meta: [`${profile.currentRole.title[locale]} · ${profile.currentRole.org}`, profile.location[locale]],
      accent: "green",
      sections: [
        { title: m.drawer.rooms.bio, body: profile.bio[locale] },
        { title: m.drawer.rooms.story, body: profile.story[locale] },
        { title: m.drawer.rooms.principles, items: profile.principles.map((p) => ({ title: p.title[locale], meta: p.text[locale] })) },
      ],
      page: "/",
    }),
    single({
      id: roomId("L1", "stats"),
      kind: "lobby",
      title: m.hud.rooms.stats,
      accent: "green",
      metrics: getStats().map((s) => ({ value: s.value, label: s.label[locale] })),
      page: "/#stats",
      // The ring's live visits tile comes from the public stats: the observatory in the Lobby's south-west corner shows them in full.
      link: { room: roomId("L1", "visits"), label: m.stats.openObservatory },
    }),
    single({
      id: roomId("L1", "skills"),
      kind: "lobby",
      title: m.hud.rooms.skills,
      accent: "green",
      sections: getSkills().map((g) => ({ title: g.label[locale], ...logoChips(g.items) })),
      page: "/#skills",
    }),
    single({
      id: roomId("L1", "certifications"),
      kind: "lobby",
      title: m.hud.rooms.certifications,
      accent: "green",
      sections: [
        {
          items: sortCertifications(getCertifications()).map((c) => ({
            title: c.code ? `${c.code} · ${c.name}` : c.name,
            meta: `${c.issuer} · ${c.status === "in-progress" ? m.drawer.rooms.inProgress : formatYearMonth(c.issued, locale)}${c.status === "expired" ? ` · ${m.certs.status.expired}` : ""}`,
            href: c.credentialUrl,
            external: Boolean(c.credentialUrl),
          })),
        },
      ],
      page: "/#certifications",
    }),
    // Visitor Observatory: public visit stats, fetched by the drawer (`VisitsBody`), never baked into this file.
    single({
      id: roomId("L1", "visits"),
      kind: "visits",
      title: m.hud.rooms.visits,
      subtitle: m.stats.intro,
      accent: "violet",
      page: "/contact#visits",
      visits: visitsLabels(locale),
    }),
  ]);
  return [...lobby, ...buildOfficeViews(locale)];
}

/**
 * L1 Agent Office: the summary half of the wall, the GitHub half, the CI tower and one drawer per desk, both rows (`OfficeBody`, live data on the client).
 * Each keeps one standing note as its section: the drawer shows it if the office chunk fails to load.
 */
function buildOfficeViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const o = m.office["3d"];
  return chain([
    single({ id: roomId("L1", "office"), kind: "office", title: m.hud.rooms.office, subtitle: o.subtitle, accent: "cyan", sections: [{ body: o.hooks }], office: { panel: "summary" } }),
    single({ id: roomId("L1", "office-github"), kind: "office", title: o.githubTitle, subtitle: o.subtitle, accent: "green", sections: [{ body: o.githubNote }], office: { panel: "github" } }),
    single({ id: roomId("L1", "office-ci"), kind: "office", title: o.ciTitle, subtitle: o.subtitle, accent: "violet", sections: [{ body: o.ciNote }], office: { panel: "ci" } }),
    ...Array.from({ length: OFFICE_SEATS }, (_, slot) =>
      single({ id: roomId("L1", `office-desk-${slot + 1}`), kind: "office", title: fill(o.desk, { n: String(slot + 1) }), subtitle: o.subtitle, accent: "cyan", sections: [{ body: o.hooks }], office: { panel: "desk", slot } }),
    ),
  ]);
}
