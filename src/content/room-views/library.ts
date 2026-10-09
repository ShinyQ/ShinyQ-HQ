import { createTranslator } from "next-intl";
import { getContact, getLibrary, getPosts, getProfile } from "../load";
import type { Locale } from "../schema";
import { isResearch, publicationDate, researchPublications } from "../selectors";
import { formatDate, formatYearMonth } from "@/lib/format";
import { chain, chipLogos, fill, linkLogo, messages, roomId, single } from "./shared";
import type { RoomView } from "./types";

/** L4 Library (Phase 5a): posts (hosted ones link their /blog page, Medium ones open externally), the research shelf, the models shelf and the talks stage. */
export function buildLibraryViews(locale: Locale): RoomView[] {
  const m = messages(locale);
  const library = getLibrary();
  const badge = (languages: readonly Locale[]) => languages.map((l) => m.common.langBadge[l]).join("/");
  const posts = getPosts().map((post) =>
    single({
      id: roomId("L4", post.slug),
      kind: "post",
      title: post.title[locale],
      subtitle: post.excerpt[locale],
      meta: [formatDate(post.date, locale), badge(post.languages)],
      accent: "white",
      sections: [
        ...(post.languages.includes(locale) ? [] : [{ body: fill(m.drawer.rooms.writtenIn, { languages: badge(post.languages) }) }]),
        ...(post.tags.length ? [{ title: m.drawer.rooms.tags, chips: [...post.tags], chipLogos: chipLogos(post.tags) }] : []),
      ],
      page: post.url ? undefined : `/blog/${post.slug}`,
      external: post.url,
    }),
  );
  const t = createTranslator({ locale, messages: m, namespace: "library" });
  const metrics = library.researchMetrics;
  const asOf = metrics ? formatYearMonth(metrics.asOf, locale) : "";
  const contact = getContact();
  const profiles = [
    ...(contact.googleScholar ? [{ title: "Google Scholar", href: contact.googleScholar, external: true, ...linkLogo("Google Scholar") }] : []),
    ...(contact.ieeeXplore ? [{ title: "IEEE Xplore", href: contact.ieeeXplore, external: true, ...linkLogo("IEEE Xplore") }] : []),
  ];
  const research = single({
    id: roomId("L4", "research"),
    kind: "research",
    title: m.hud.rooms.research,
    subtitle: m.library.researchIntro,
    accent: "amber",
    research: {
      self: getProfile().name,
      profiles,
      metrics: metrics ? t("metrics", { citations: metrics.citations, hIndex: metrics.hIndex, source: metrics.source, date: asOf }) : undefined,
      items: researchPublications(library.publications).map((p) => ({
        id: p.id,
        title: p.title,
        kind: m.library.kind[p.kind],
        authors: p.authors ?? [getProfile().name],
        venue: [p.venue, p.publisher].filter(Boolean).join(", ") || undefined,
        date: publicationDate(p, locale),
        doi: p.doi,
        href: p.url,
        pdf: p.pdf,
        code: p.code,
        citations: p.citations !== undefined && metrics ? t("citations", { count: p.citations, source: metrics.source, date: asOf }) : undefined,
        summary: p.summary?.[locale],
      })),
    },
    page: "/library#research",
  });
  const shelves = [
    research,
    single({
      id: roomId("L4", "publications"),
      kind: "shelf",
      title: m.hud.rooms.publications,
      accent: "white",
      sections: [
        {
          items: library.publications.filter((p) => !isResearch(p.kind)).map((p) => ({
            title: p.title,
            meta: [m.library.kind[p.kind], p.venue, String(p.year)].filter(Boolean).join(" · "),
            href: p.url,
            external: Boolean(p.url),
            ...(p.kind === "model" ? linkLogo("Hugging Face") : {}),
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
