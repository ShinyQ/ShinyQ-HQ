import { getCertifications, getProfile, getSkills, getStats } from "../load";
import type { Locale } from "../schema";
import { formatYearMonth } from "@/lib/format";
import { chain, messages, roomId, single } from "./shared";
import type { RoomView } from "./types";

/** L1 Lobby: profile hologram, stats ring, skills wall and certifications wall. */
export function buildLobbyViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const profile = getProfile();
  return chain([
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
      metrics: getStats().map((s) => ({ value: s.value, label: s.label[locale], confidence: s.confidence })),
      page: "/#stats",
    }),
    single({
      id: roomId("L1", "skills"),
      kind: "lobby",
      title: m.hud.rooms.skills,
      accent: "green",
      sections: getSkills().map((g) => ({ title: g.label[locale], chips: [...g.items] })),
      page: "/#skills",
    }),
    single({
      id: roomId("L1", "certifications"),
      kind: "lobby",
      title: m.hud.rooms.certifications,
      accent: "green",
      sections: [
        {
          items: getCertifications().map((c) => ({
            title: c.code ? `${c.code} · ${c.name}` : c.name,
            meta: `${c.issuer} · ${c.status === "earned" ? formatYearMonth(c.issued, locale) : m.drawer.rooms.inProgress}`,
            href: c.credentialUrl,
            external: Boolean(c.credentialUrl),
          })),
        },
      ],
      page: "/#certifications",
    }),
  ]);
}
