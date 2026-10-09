/**
 * schema.org structured data built from content (never hardcoded facts).
 * Rendered with <JsonLd> as `application/ld+json` scripts.
 */
import { getContact, getProfile } from "@/content/load";
import type { Locale, Pod, PostRef } from "@/content/schema";
import { SITE_NAME, SITE_URL, absoluteUrl, localePath } from "@/lib/site";

type JsonLdObject = Record<string, unknown>;

export const PERSON_ID = `${SITE_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

const LANGUAGE_TAG: Record<Locale, string> = { en: "en", id: "id" };

export function personJsonLd(locale: Locale): JsonLdObject {
  const profile = getProfile();
  const contact = getContact();
  const sameAs = [contact.linkedin, contact.github, contact.huggingface, contact.medium].filter(Boolean);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": PERSON_ID,
    name: profile.name,
    alternateName: profile.handle,
    jobTitle: profile.headline[locale],
    description: profile.bio[locale],
    url: absoluteUrl(localePath(locale, "/")),
    sameAs,
    worksFor: { "@type": "Organization", name: profile.currentRole.org },
    homeLocation: { "@type": "Place", name: profile.location[locale] },
  };
}

export function websiteJsonLd(locale: Locale): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: absoluteUrl(localePath(locale, "/")),
    inLanguage: LANGUAGE_TAG[locale],
    author: { "@id": PERSON_ID },
  };
}

export function podJsonLd(pod: Pod, locale: Locale): JsonLdObject {
  const url = absoluteUrl(localePath(locale, `/labs/${pod.slug}`));
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${url}#work`,
    name: pod.title[locale],
    headline: pod.title[locale],
    description: pod.tagline[locale],
    abstract: pod.problem[locale],
    url,
    inLanguage: LANGUAGE_TAG[locale],
    // schema.org accepts ISO 8601 partial dates such as "2024-03".
    dateCreated: pod.period.start,
    ...(pod.period.end !== "present" ? { dateModified: pod.period.end } : {}),
    keywords: pod.stack.join(", "),
    genre: pod.wing === "ai" ? "AI engineering" : "Software engineering",
    creator: { "@id": PERSON_ID },
    author: { "@id": PERSON_ID },
    isPartOf: { "@id": WEBSITE_ID },
  };
}

/** `contentLocale` is the language the post body is actually written in (translation fallback). */
export function postJsonLd(post: PostRef, locale: Locale, contentLocale: Locale): JsonLdObject {
  const url = absoluteUrl(localePath(locale, `/blog/${post.slug}`));
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    "@id": `${url}#article`,
    headline: post.title[contentLocale],
    description: post.excerpt[locale],
    url,
    mainEntityOfPage: url,
    inLanguage: LANGUAGE_TAG[contentLocale],
    datePublished: post.date,
    keywords: post.tags.join(", "),
    author: { "@id": PERSON_ID },
    publisher: { "@id": PERSON_ID },
    isPartOf: { "@id": WEBSITE_ID },
  };
}

/** JSON for a <script type="application/ld+json">, with `<` escaped against injection. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
