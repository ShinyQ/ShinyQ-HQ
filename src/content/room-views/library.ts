import { getLibrary, getPosts } from "../load";
import type { Locale } from "../schema";
import { formatDate, formatYearMonth } from "@/lib/format";
import { chain, messages, roomId, single } from "./shared";
import type { RoomView } from "./types";

/** L4 Library (baseline, owned by Phase 5a): posts, the publications shelf and the talks stage. */
export function buildLibraryViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const library = getLibrary();
  const posts = getPosts().map((post) =>
    single({
      id: roomId("L4", post.slug),
      kind: "post",
      title: post.title[locale],
      subtitle: post.excerpt[locale],
      meta: [formatDate(post.date, locale), post.languages.map((l) => m.common.langBadge[l]).join("/")],
      accent: "white",
      sections: post.tags.length ? [{ title: m.drawer.rooms.tags, chips: [...post.tags] }] : [],
      page: post.url ? undefined : `/blog/${post.slug}`,
      external: post.url,
    }),
  );
  const shelves = [
    single({
      id: roomId("L4", "publications"),
      kind: "shelf",
      title: m.hud.rooms.publications,
      accent: "white",
      sections: [
        {
          items: library.publications.map((p) => ({
            title: p.title,
            meta: [m.library.kind[p.kind], p.venue, String(p.year)].filter(Boolean).join(" · "),
            href: p.url,
            external: Boolean(p.url),
          })),
        },
      ],
      page: "/library#publications",
    }),
    single({
      id: roomId("L4", "talks"),
      kind: "shelf",
      title: m.hud.rooms.talks,
      accent: "white",
      sections: [
        {
          items: library.talks.map((t) => ({ title: t.title[locale], meta: `${t.event} · ${m.library.role[t.role]} · ${formatYearMonth(t.date, locale)}` })),
        },
      ],
      page: "/library#talks",
    }),
  ];
  return chain([...posts, ...shelves]);
}
