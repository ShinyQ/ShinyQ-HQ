/**
 * schema.org structured data built from content (never hardcoded facts), worded like the page
 * metadata (src/lib/seo.ts). Rendered with <JsonLd> as `application/ld+json` scripts.
 */
import { getPostSource } from "@/content/blog";
import { getBuildFacts, getBuildStory } from "@/content/build-story";
import { getContact, getPod, getPost, getProfile, getSkills, getTimeline, getTimelineEntry } from "@/content/load";
import type { Locale, Pod, PostRef } from "@/content/schema";
import { podLiveLink } from "@/content/selectors";
import { OG_PHOTO_PATH } from "@/lib/og-layout";
import { seoFor } from "@/lib/seo";
import { SITE_NAME, SITE_URL, absoluteUrl, localePath, ogImagePath } from "@/lib/site";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

type JsonLdObject = Record<string, unknown>;

const MESSAGES = { en, id } as const;
const GENRE: Record<Pod["wing"], string> = { software: "Software engineering", ai: "AI engineering", data: "Data science and machine learning" };

export const PERSON_ID = `${SITE_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

const LANGUAGE_TAG: Record<Locale, string> = { en: "en", id: "id" };
/** Skills listed in Person.knowsAbout (CV skill groups in content order). */
const KNOWS_ABOUT_MAX = 24;

/** "Metrodata (PT Mitra Integrasi Informatika)" -> Organization "Metrodata", alternateName "PT Mitra Integrasi Informatika". */
export function organizationJsonLd(org: string, type = "Organization"): JsonLdObject {
  const match = org.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return match ? { "@type": type, name: match[1], alternateName: match[2] } : { "@type": type, name: org };
}

/** "Jakarta, Indonesia" -> PostalAddress with locality "Jakarta" and country "Indonesia". */
export function addressJsonLd(location: string): JsonLdObject {
  const [locality, ...rest] = location.split(",").map((part) => part.trim());
  return { "@type": "PostalAddress", addressLocality: locality, ...(rest.length ? { addressCountry: rest.join(", ") } : {}) };
}

/** Reference to the site's Person with its name inline, for author and creator fields. */
function personRef(locale: Locale): JsonLdObject {
  return { "@type": "Person", "@id": PERSON_ID, name: getProfile().name, url: absoluteUrl(localePath(locale, "/")) };
}

export function personJsonLd(locale: Locale): JsonLdObject {
  const profile = getProfile();
  const contact = getContact();
  const sameAs = [contact.linkedin, contact.github, contact.googleScholar, contact.ieeeXplore, contact.huggingface, contact.medium].filter(Boolean);
  const schools = [...new Set(getTimeline().filter((e) => e.type === "education").map((e) => e.org))];
  const knowsAbout = [...new Set(getSkills().flatMap((g) => g.items))].slice(0, KNOWS_ABOUT_MAX);
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    "@id": PERSON_ID,
    name: profile.name,
    alternateName: profile.handle,
    jobTitle: profile.headline[locale],
    description: profile.bio[locale],
    disambiguatingDescription: profile.subheadline[locale],
    image: absoluteUrl(OG_PHOTO_PATH),
    url: absoluteUrl(localePath(locale, "/")),
    sameAs,
    worksFor: organizationJsonLd(profile.currentRole.org),
    address: addressJsonLd(profile.location[locale]),
    homeLocation: { "@type": "Place", name: profile.location[locale] },
    ...(schools.length ? { alumniOf: schools.map((school) => organizationJsonLd(school, "CollegeOrUniversity")) } : {}),
    ...(knowsAbout.length ? { knowsAbout } : {}),
  };
}

/** The About page (/contact) is the owner's profile page: ProfilePage with the Person as its main entity. */
export function profilePageJsonLd(locale: Locale): JsonLdObject {
  const url = absoluteUrl(localePath(locale, "/contact"));
  const person = personJsonLd(locale);
  delete person["@context"];
  return {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    "@id": `${url}#profile`,
    url,
    name: seoFor(locale, "/contact").title,
    inLanguage: LANGUAGE_TAG[locale],
    mainEntity: person,
    isPartOf: { "@id": WEBSITE_ID },
  };
}

export function websiteJsonLd(locale: Locale): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    alternateName: getProfile().name,
    description: seoFor(locale, "/").description,
    url: absoluteUrl(localePath(locale, "/")),
    inLanguage: LANGUAGE_TAG[locale],
    author: { "@id": PERSON_ID },
  };
}

export function podJsonLd(pod: Pod, locale: Locale): JsonLdObject {
  const url = absoluteUrl(localePath(locale, `/labs/${pod.slug}`));
  const live = podLiveLink(pod);
  return {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    "@id": `${url}#work`,
    name: pod.title[locale],
    headline: pod.title[locale],
    description: seoFor(locale, `/labs/${pod.slug}`).description,
    abstract: pod.problem[locale],
    url,
    inLanguage: LANGUAGE_TAG[locale],
    // schema.org accepts ISO 8601 partial dates such as "2024-03".
    dateCreated: pod.period.start,
    ...(pod.period.end !== "present" ? { dateModified: pod.period.end } : {}),
    keywords: pod.stack.join(", "),
    ...(live ? { sameAs: [live.href] } : {}),
    image: [absoluteUrl(ogImagePath({ kind: "labs", locale, slug: pod.slug })), ...pod.assets.slice(0, 3).map((a) => absoluteUrl(a.src))],
    genre: GENRE[pod.wing],
    creator: personRef(locale),
    author: personRef(locale),
    ...(pod.repos?.length
      ? {
          hasPart: pod.repos.map((repo) => ({
            "@type": "SoftwareSourceCode",
            name: repo.split("/").pop(),
            codeRepository: repo,
            url: repo,
            author: { "@id": PERSON_ID },
          })),
        }
      : {}),
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
    description: seoFor(locale, `/blog/${post.slug}`).description,
    image: [absoluteUrl(ogImagePath({ kind: "blog", locale, slug: post.slug }))],
    url,
    mainEntityOfPage: url,
    inLanguage: LANGUAGE_TAG[contentLocale],
    datePublished: post.date,
    keywords: post.tags.join(", "),
    author: personRef(locale),
    publisher: { "@id": PERSON_ID },
    isPartOf: { "@id": WEBSITE_ID },
  };
}

/** Topics of the build story page (/build), as schema.org Things. */
const BUILD_ABOUT = ["Next.js", "React Three Fiber", "Cloudflare Pages", "AI coding agents"];

/** The build story page (/build): a TechArticle by the owner, dated by the build facts snapshot. */
export function techArticleJsonLd(locale: Locale): JsonLdObject {
  const url = absoluteUrl(localePath(locale, "/build"));
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${url}#article`,
    headline: getBuildStory().title[locale],
    description: seoFor(locale, "/build").description,
    image: [absoluteUrl(ogImagePath({ kind: "page", locale, page: "build" }))],
    url,
    mainEntityOfPage: url,
    inLanguage: LANGUAGE_TAG[locale],
    dateModified: getBuildFacts().generatedAt,
    about: BUILD_ABOUT.map((name) => ({ "@type": "Thing", name })),
    author: personRef(locale),
    publisher: { "@id": PERSON_ID },
    isPartOf: { "@id": WEBSITE_ID },
  };
}

/** JSON for a <script type="application/ld+json">, with `<` escaped against injection. */
export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

export function breadcrumbJsonLd(crumbs: { name: string; path: string }[], locale: Locale): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, i) => ({ "@type": "ListItem", position: i + 1, name: crumb.name, item: absoluteUrl(localePath(locale, crumb.path)) })),
  };
}

type Section = "quick" | "journey" | "labs" | "library" | "contact" | "cv" | "build";

/** Structured data a page adds to the layout's Person and WebSite: its breadcrumb, plus the pod or post itself. */
export function pageJsonLd(locale: Locale, path: string): JsonLdObject[] {
  if (path === "/") return [];
  const messages = MESSAGES[locale];
  const [, section, slug] = path.split("/");
  const parent = (section === "blog" ? "library" : section) as Section;
  const crumbs = [
    { name: messages.seo.home, path: "/" },
    { name: messages.meta[parent], path: `/${parent}` },
  ];
  const extra: JsonLdObject[] = [];
  if (slug && section === "labs") {
    const pod = getPod(slug);
    if (pod) {
      crumbs.push({ name: pod.title[locale], path });
      extra.push(podJsonLd(pod, locale));
    }
  } else if (slug && section === "blog") {
    const post = getPost(slug);
    if (post) {
      crumbs.push({ name: post.title[locale], path });
      extra.push(postJsonLd(post, locale, getPostSource(slug, locale)?.locale ?? locale));
    }
  } else if (slug && section === "journey") {
    const entry = getTimelineEntry(slug);
    if (entry) crumbs.push({ name: `${entry.role[locale]}, ${entry.org}`, path });
  } else if (!slug && section === "contact") {
    extra.push(profilePageJsonLd(locale));
  } else if (!slug && section === "build") {
    extra.push(techArticleJsonLd(locale));
  }
  return [breadcrumbJsonLd(crumbs, locale), ...extra];
}
