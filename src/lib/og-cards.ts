/**
 * The build-time OG images and their content: one home card per locale, one per section page
 * (journey entries share the journey card), one per pod and per hosted post, in both locales.
 * Paths end in `.jpg` (ogImagePath). Synchronous and pure over content and messages, so tests call it.
 */
import { createTranslator } from "next-intl";
import { getPostSource } from "@/content/blog";
import { getContent, getPod, getPost, getProfile } from "@/content/load";
import { type FloorId, LOCALES, type Locale } from "@/content/schema";
import { clientLabel } from "@/content/selectors";
import { FLOOR_ACCENT, WING_ACCENT } from "@/lib/accent";
import { formatDate } from "@/lib/format";
import { OG_EYEBROW_MAX, type OgCard, clampText, ogText } from "@/lib/og-layout";
import { journeyYears, keyResult } from "@/lib/seo";
import { OG_PAGES, type OgPage, type OgTarget, ogImagePath } from "@/lib/site";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

export type { OgTarget };

const MESSAGES = { en, id } as const;

/** The floor each section page lives on in 3D: its eyebrow and accent. */
export const PAGE_FLOOR: Record<OgPage, FloorId> = { quick: "L1", journey: "L2", labs: "L3", library: "L4", contact: "RF", cv: "RF", build: "L1" };

export function allOgTargets(): OgTarget[] {
  const { floors } = getContent();
  const hosted = floors.library.posts.filter((p) => !p.url);
  return LOCALES.flatMap((locale): OgTarget[] => [
    { kind: "default", locale },
    ...OG_PAGES.map((page) => ({ kind: "page" as const, locale, page })),
    ...floors.labs.pods.map((p) => ({ kind: "labs" as const, locale, slug: p.slug })),
    ...hosted.map((p) => ({ kind: "blog" as const, locale, slug: p.slug })),
  ]);
}

/** Catch-all segments (without the "og" prefix) for a target. */
export function ogSegments(target: OgTarget): string[] {
  return ogImagePath(target).split("/").slice(2);
}

export function parseOgSegments(segments: string[]): OgTarget | undefined {
  const wanted = `/og/${segments.join("/")}`;
  return allOgTargets().find((t) => ogImagePath(t) === wanted);
}

function pageSubtitle(page: OgPage, locale: Locale): string {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "seo.og.pages" });
  const { floors } = getContent();
  if (page === "journey") return t("journey.subtitle", { ...journeyYears(), count: String(floors.careerArchive.entries.length) });
  if (page === "labs") return t("labs.subtitle", { count: String(floors.labs.pods.length) });
  if (page === "library") return t("library.subtitle", { posts: String(floors.library.posts.length), papers: String(floors.library.publications.length) });
  return t(`${page}.subtitle`);
}

/** "L3 · <wing> · <sector>", dropping the wing (the accent color still shows it), then shortening, when it would not fit on one line. */
function projectEyebrow(wing: string, sector: string | undefined, shot: boolean): string {
  const max = shot ? OG_EYEBROW_MAX.shot : OG_EYEBROW_MAX.wide;
  const full = ["L3", wing, sector].filter(Boolean).join(" · ");
  if (!sector || full.length <= max) return full;
  return clampText(`L3 · ${sector}`, max);
}

export function ogCard(target: OgTarget): OgCard {
  const { locale } = target;
  const messages = MESSAGES[locale];
  const profile = getProfile();
  const tx = (text: string) => ogText(text, locale);
  const base = { name: profile.name, headline: tx(profile.headline[locale]) };

  if (target.kind === "default") {
    return {
      ...base,
      layout: "home",
      eyebrow: `${messages.meta.siteName} · ${messages.floors.L1}`,
      title: profile.name,
      subtitle: tx(profile.headline[locale]),
      motto: tx(profile.subheadline[locale]),
      accent: "cyan",
      still: "L1",
      cta: messages.seo.og.cta,
    };
  }
  if (target.kind === "page") {
    const floor = PAGE_FLOOR[target.page];
    const copy = messages.seo.og.pages[target.page];
    return {
      ...base,
      layout: "page",
      // The build story has no public floor of its own: its card names the Engine Room instead of the floor it borrows.
      eyebrow: "eyebrow" in copy ? copy.eyebrow : `${floor} · ${messages.floors[floor]}`,
      title: copy.title,
      subtitle: pageSubtitle(target.page, locale),
      accent: FLOOR_ACCENT[floor],
      still: floor,
    };
  }
  if (target.kind === "labs") {
    const pod = getPod(target.slug);
    if (!pod) throw new Error(`Unknown pod for OG image: ${target.slug}`);
    const result = keyResult(pod);
    return {
      ...base,
      layout: "project",
      eyebrow: projectEyebrow(messages.common.wing[pod.wing], clientLabel(pod.client, locale), Boolean(pod.assets[0])),
      title: tx(pod.title[locale]),
      subtitle: tx(pod.tagline[locale]),
      accent: WING_ACCENT[pod.wing],
      still: "L3",
      shot: pod.assets[0]?.src,
      result: { value: tx(result.value), label: tx(result.label[locale]) },
    };
  }
  const post = getPost(target.slug);
  if (!post) throw new Error(`Unknown post for OG image: ${target.slug}`);
  const contentLocale = getPostSource(target.slug, locale)?.locale ?? locale;
  return {
    ...base,
    layout: "post",
    eyebrow: `L4 · ${messages.seo.og.writing} · ${formatDate(post.date, locale)}`,
    title: tx(post.title[contentLocale]),
    accent: "cyan",
    still: "L4",
  };
}
