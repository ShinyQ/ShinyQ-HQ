/**
 * The set of build-time OG images: one default per locale plus one per pod
 * and hosted post, in both locales. Paths end in `.png` so static hosts
 * serve the right Content-Type.
 */
import { getTranslations } from "next-intl/server";
import { getPostSource } from "@/content/blog";
import { getContent, getPod, getPost, getProfile } from "@/content/load";
import { LOCALES } from "@/content/schema";
import { formatDate } from "@/lib/format";
import type { OgCard } from "@/lib/og";
import { type OgTarget, ogImagePath } from "@/lib/site";

export type { OgTarget };


export function allOgTargets(): OgTarget[] {
  const { floors } = getContent();
  const hosted = floors.library.posts.filter((p) => !p.url);
  return LOCALES.flatMap((locale): OgTarget[] => [
    { kind: "default", locale },
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

export async function ogCard(target: OgTarget): Promise<OgCard> {
  const { locale } = target;
  const profile = getProfile();
  if (target.kind === "default") {
    const t = await getTranslations({ locale, namespace: "meta" });
    return {
      eyebrow: `${t("siteName")} · L1`,
      title: profile.headline[locale],
      subtitle: profile.subheadline[locale],
      accent: "cyan",
      footer: profile.location[locale],
    };
  }
  if (target.kind === "labs") {
    const pod = getPod(target.slug);
    if (!pod) throw new Error(`Unknown pod for OG image: ${target.slug}`);
    const tc = await getTranslations({ locale, namespace: "common" });
    return {
      eyebrow: `L3 · ${tc(`wing.${pod.wing}`)}${pod.client ? ` · ${pod.client}` : ""}`,
      title: pod.title[locale],
      subtitle: pod.tagline[locale],
      accent: pod.accent,
      footer: profile.headline[locale],
    };
  }
  const post = getPost(target.slug);
  if (!post) throw new Error(`Unknown post for OG image: ${target.slug}`);
  const contentLocale = getPostSource(target.slug, locale)?.locale ?? locale;
  return {
    eyebrow: `L4 · ${formatDate(post.date, locale)}`,
    title: post.title[contentLocale],
    subtitle: post.excerpt[locale],
    accent: "white",
    footer: profile.headline[locale],
  };
}
