import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { Analytics } from "@/components/Analytics";
import { getContent } from "@/content/load";
import { LOCALES } from "@/content/schema";
import {
  PERSON_ID,
  WEBSITE_ID,
  addressJsonLd,
  breadcrumbJsonLd,
  organizationJsonLd,
  pageJsonLd,
  personJsonLd,
  podJsonLd,
  postJsonLd,
  profilePageJsonLd,
  serializeJsonLd,
  websiteJsonLd,
} from "@/lib/jsonld";
import { seoFor } from "@/lib/seo";
import { allPagePaths, lastModified, sitemapDate } from "@/lib/routes";
import {
  SITE_URL,
  languageAlternates,
  ogImagePath,
  pageMetadata,
  resolveBeaconToken,
  resolveSiteUrl,
  resolveVerificationToken,
  searchVerification,
} from "@/lib/site";

const { floors } = getContent();
const hostedPosts = floors.library.posts.filter((p) => !p.url);

describe("site config", () => {
  it("falls back to the default origin for empty or invalid values", () => {
    expect(resolveSiteUrl(undefined)).toBe("https://kurniadi.pages.dev");
    expect(resolveSiteUrl("")).toBe("https://kurniadi.pages.dev");
    expect(resolveSiteUrl("not a url")).toBe("https://kurniadi.pages.dev");
    expect(resolveSiteUrl("ftp://kurniadi.dev")).toBe("https://kurniadi.pages.dev");
  });

  it("normalizes a configured origin", () => {
    expect(resolveSiteUrl(" https://kurniadi.dev/ ")).toBe("https://kurniadi.dev");
  });

  it("accepts only plain alphanumeric beacon tokens", () => {
    expect(resolveBeaconToken(undefined)).toBeUndefined();
    expect(resolveBeaconToken("  ")).toBeUndefined();
    expect(resolveBeaconToken('abc"><script>')).toBeUndefined();
    expect(resolveBeaconToken("0123456789abcdef0123456789abcdef")).toBe("0123456789abcdef0123456789abcdef");
  });

  it("renders search engine verification tags only for well-formed tokens", () => {
    expect(searchVerification({})).toBeUndefined();
    expect(resolveVerificationToken('x"><script>')).toBeUndefined();
    expect(resolveVerificationToken("short")).toBeUndefined();
    expect(searchVerification({ GOOGLE_SITE_VERIFICATION: " AbC_dEf-123456789 " })).toEqual({ google: "AbC_dEf-123456789" });
    expect(searchVerification({ BING_SITE_VERIFICATION: "0123456789ABCDEF0123456789ABCDEF" })).toEqual({
      other: { "msvalidate.01": "0123456789ABCDEF0123456789ABCDEF" },
    });
  });
});

describe("pageMetadata", () => {
  it("sets canonical, hreflang alternates and the default share card", () => {
    const meta = pageMetadata({ locale: "id", path: "/labs", title: "Labs", description: "Desc" });
    expect(meta.alternates?.canonical).toBe("/id/labs");
    expect(meta.title).toEqual({ absolute: "Labs" });
    expect(meta.alternates?.languages).toEqual({ en: "/en/labs", id: "/id/labs", "x-default": "/en/labs" });
    expect(meta.openGraph).toMatchObject({ locale: "id_ID", url: "/id/labs", siteName: "ShinyQ HQ", type: "website" });
    expect(meta.openGraph?.images).toEqual([
      { url: "/og/id.jpg", ...(SITE_URL.startsWith("https:") ? { secureUrl: `${SITE_URL}/og/id.jpg` } : {}), width: 1200, height: 630, type: "image/jpeg", alt: "Labs" },
    ]);
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: "Labs" });
  });

  it("keeps the share title for Open Graph and Twitter when the document title is shorter", () => {
    const meta = pageMetadata({ locale: "en", path: "/labs", title: "A long share title", documentTitle: "Short" });
    expect(meta.title).toEqual({ absolute: "Short" });
    expect(meta.openGraph).toMatchObject({ title: "A long share title" });
    expect(meta.twitter).toMatchObject({ title: "A long share title" });
  });

  it("maps the root path without a trailing segment", () => {
    expect(pageMetadata({ locale: "en", path: "/" }).alternates?.canonical).toBe("/en");
  });

  it("supports article cards with a specific image", () => {
    const image = ogImagePath({ kind: "blog", locale: "en", slug: "post" });
    const meta = pageMetadata({ locale: "en", path: "/blog/post", title: "Post", type: "article", publishedTime: "2026-01-02", image });
    expect(meta.openGraph).toMatchObject({ type: "article", publishedTime: "2026-01-02" });
    expect(meta.openGraph?.images).toMatchObject([{ url: "/og/en/blog/post.jpg" }]);
  });
});

describe("sitemap and robots", () => {
  const paths = allPagePaths();

  it("lists every static page, journey entry, pod and hosted post", () => {
    expect(paths).toContain("/");
    expect(paths).toContain("/quick");
    expect(paths).toContain("/build");
    expect(paths).toHaveLength(8 + floors.careerArchive.entries.length + floors.labs.pods.length + hostedPosts.length);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.some((p) => floors.library.posts.some((post) => post.url && p === `/blog/${post.slug}`))).toBe(false);
  });

  it("has one absolute entry per locale with hreflang alternates", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(paths.length * 2);
    const pod = floors.labs.pods[0].slug;
    const entry = entries.find((e) => e.url === `${SITE_URL}/id/labs/${pod}`);
    expect(entry?.alternates?.languages).toEqual(languageAlternates(`/labs/${pod}`, (p) => `${SITE_URL}${p}`));
    expect(entries.every((e) => e.url.startsWith(`${SITE_URL}/`))).toBe(true);
  });

  it("points robots at the sitemap without the non-standard Host line", () => {
    expect(robots()).toEqual({ rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE_URL}/sitemap.xml` });
  });

  it("dates posts, Writing, Journey, Home and Quick view from content, and nothing else", () => {
    const post = hostedPosts[0];
    expect(lastModified(`/blog/${post.slug}`)).toBe(post.date);
    const newestPost = [...floors.library.posts].map((p) => p.date).sort().at(-1);
    expect(lastModified("/library")).toBe(newestPost);
    expect(lastModified("/journey")).toMatch(/^\d{4}-\d{2}(-\d{2})?$/);
    expect(lastModified("/")! >= newestPost!).toBe(true);
    expect(lastModified("/")! >= lastModified("/journey")!).toBe(true);
    expect(lastModified("/quick")).toBe(lastModified("/"));
    for (const path of ["/labs", "/contact", "/cv", `/labs/${floors.labs.pods[0].slug}`]) expect(lastModified(path), path).toBeUndefined();
    const today = new Date().toISOString().slice(0, 10);
    for (const path of allPagePaths()) {
      const date = lastModified(path);
      if (date) expect(date.slice(0, today.length) <= today, path).toBe(true);
    }
    const entry = sitemap().find((e) => e.url === `${SITE_URL}/en/blog/${post.slug}`);
    expect(entry?.lastModified).toBe(post.date);
  });

  it("writes every sitemap lastmod as a full YYYY-MM-DD date and drops month-only dates (Search Console)", () => {
    expect(sitemapDate("2026-10-09")).toBe("2026-10-09");
    expect(sitemapDate("2026-11-02T01:17:46.588Z")).toBe("2026-11-02");
    for (const bad of ["2026-10", "2026", "", "10/09/2026", undefined]) expect(sitemapDate(bad), String(bad)).toBeUndefined();
    const entries = sitemap();
    for (const e of entries) if (e.lastModified !== undefined) expect(e.lastModified, e.url).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const journey = entries.find((e) => e.url === `${SITE_URL}/en/journey`);
    expect(journey?.lastModified).toBe(sitemapDate(lastModified("/journey")));
  });
});

describe("JSON-LD", () => {
  it("describes the person with sameAs profile links", () => {
    const person = personJsonLd("en");
    const contact = floors.roof.contact;
    expect(person).toMatchObject({ "@type": "Person", "@id": PERSON_ID, name: getContent().profile.name });
    expect(person.sameAs).toEqual(expect.arrayContaining([contact.linkedin, contact.github, contact.googleScholar]));
  });

  it("gives the person the employer, the city, the university and skills from content", () => {
    const { profile } = getContent();
    const person = personJsonLd("en");
    expect(person.worksFor).toEqual({ "@type": "Organization", name: "Metrodata", alternateName: "PT Mitra Integrasi Informatika" });
    expect(person.address).toEqual({ "@type": "PostalAddress", addressLocality: "Jakarta", addressCountry: "Indonesia" });
    expect(person.alumniOf).toEqual([{ "@type": "CollegeOrUniversity", name: "Telkom University" }]);
    expect(person.knowsAbout).toEqual(expect.arrayContaining([getContent().skills[0].items[0]]));
    expect(organizationJsonLd(profile.currentRole.org).name).toBe("Metrodata");
    expect(organizationJsonLd("Jublia")).toEqual({ "@type": "Organization", name: "Jublia" });
    expect(addressJsonLd("Jakarta")).toEqual({ "@type": "PostalAddress", addressLocality: "Jakarta" });
  });

  it("marks the About page as the owner's ProfilePage", () => {
    for (const locale of LOCALES) {
      const types = pageJsonLd(locale, "/contact").map((d) => d["@type"]);
      expect(types).toEqual(["BreadcrumbList", "ProfilePage"]);
      const page = profilePageJsonLd(locale);
      expect(page).toMatchObject({ url: `${SITE_URL}/${locale}/contact`, isPartOf: { "@id": WEBSITE_ID } });
      expect(page.mainEntity).toMatchObject({ "@type": "Person", "@id": PERSON_ID, name: getContent().profile.name });
      expect(page.mainEntity).not.toHaveProperty("@context");
    }
  });

  it("lists a pod's public repositories as SoftwareSourceCode parts", () => {
    const pod = floors.labs.pods.find((p) => p.repos?.length)!;
    const parts = podJsonLd(pod, "en").hasPart as { "@type": string; codeRepository: string }[];
    expect(parts.map((p) => p.codeRepository)).toEqual(pod.repos);
    expect(parts.every((p) => p["@type"] === "SoftwareSourceCode")).toBe(true);
    expect(podJsonLd(floors.labs.pods.find((p) => !p.repos?.length)!, "en")).not.toHaveProperty("hasPart");
  });

  it("describes pods as CreativeWork and posts as BlogPosting", () => {
    const pod = floors.labs.pods[0];
    expect(podJsonLd(pod, "id")).toMatchObject({
      "@type": "CreativeWork",
      name: pod.title.id,
      url: `${SITE_URL}/id/labs/${pod.slug}`,
      author: { "@id": PERSON_ID },
    });
    if (hostedPosts[0]) {
      const post = hostedPosts[0];
      expect(postJsonLd(post, "en", "id")).toMatchObject({ "@type": "BlogPosting", headline: post.title.id, inLanguage: "id" });
    }
  });

  it("escapes markup so content cannot close the script tag", () => {
    expect(serializeJsonLd({ name: "</script><b>" })).not.toContain("<");
  });

  it("links a pod's public live site with sameAs, and only then (R4-J)", () => {
    const live = floors.labs.pods.find((p) => p.liveUrl)!;
    expect(podJsonLd(live, "en").sameAs).toEqual([live.liveUrl]);
    expect(podJsonLd(floors.labs.pods.find((p) => !p.liveUrl)!, "en")).not.toHaveProperty("sameAs");
  });

  it("gives the person the content headline, the motto and the photo", () => {
    const { profile } = getContent();
    expect(personJsonLd("id")).toMatchObject({
      jobTitle: profile.headline.id,
      disambiguatingDescription: profile.subheadline.id,
      image: `${SITE_URL}/og-assets/kurniadi-photo.png`,
    });
    expect(websiteJsonLd("en")).toMatchObject({ description: seoFor("en", "/").description, alternateName: profile.name });
  });

  it("describes pods and posts with the page description and the share card", () => {
    const pod = floors.labs.pods[0];
    const work = podJsonLd(pod, "en");
    expect(work.description).toBe(seoFor("en", `/labs/${pod.slug}`).description);
    expect((work.image as string[])[0]).toBe(`${SITE_URL}/og/en/labs/${pod.slug}.jpg`);
    const post = hostedPosts[0];
    const article = postJsonLd(post, "id", "id");
    expect(article.description).toBe(seoFor("id", `/blog/${post.slug}`).description);
    expect(article.image).toEqual([`${SITE_URL}/og/id/blog/${post.slug}.jpg`]);
  });

  it("adds a BreadcrumbList to every page except home", () => {
    for (const locale of LOCALES) {
      for (const path of allPagePaths()) {
        const types = pageJsonLd(locale, path).map((d) => d["@type"]);
        if (path === "/") expect(types).toEqual([]);
        else expect(types[0], path).toBe("BreadcrumbList");
      }
    }
  });

  it("orders crumbs from home to the page with absolute URLs", () => {
    const pod = floors.labs.pods[0];
    const [crumbs, work] = pageJsonLd("en", `/labs/${pod.slug}`);
    expect(crumbs.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Home", item: `${SITE_URL}/en` },
      { "@type": "ListItem", position: 2, name: "Labs", item: `${SITE_URL}/en/labs` },
      { "@type": "ListItem", position: 3, name: pod.title.en, item: `${SITE_URL}/en/labs/${pod.slug}` },
    ]);
    expect(work["@type"]).toBe("CreativeWork");
    expect(breadcrumbJsonLd([{ name: "Beranda", path: "/" }], "id")).toMatchObject({ "@type": "BreadcrumbList", itemListElement: [{ item: `${SITE_URL}/id` }] });
    const [postCrumbs] = pageJsonLd("id", `/blog/${hostedPosts[0].slug}`);
    expect((postCrumbs.itemListElement as { name: string }[])[1].name).toBe("Perpustakaan");
  });
});

describe("Analytics beacon", () => {
  it("renders nothing without a token", () => {
    // An empty token, not undefined: undefined falls back to NEXT_PUBLIC_CF_BEACON_TOKEN, which CI sets.
    expect(Analytics({ token: "" })).toBeNull();
  });

  it("renders the cookieless Cloudflare beacon with SPA tracking behind the automation guard", () => {
    const element = Analytics({ token: "0123456789abcdef0123456789abcdef" });
    const code: string = element?.props.dangerouslySetInnerHTML.__html;
    expect(code).toContain('"https://static.cloudflareinsights.com/beacon.min.js"');
    expect(code).toContain(JSON.stringify(JSON.stringify({ token: "0123456789abcdef0123456789abcdef", spa: true })));
    expect(code).toContain("navigator.webdriver");
    expect(code).not.toContain("hq:stats-optout");
  });
});
