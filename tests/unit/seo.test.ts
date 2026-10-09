import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { Analytics } from "@/components/Analytics";
import { getContent } from "@/content/load";
import { PERSON_ID, personJsonLd, podJsonLd, postJsonLd, serializeJsonLd } from "@/lib/jsonld";
import { allOgTargets, ogSegments, parseOgSegments } from "@/lib/og-cards";
import { allPagePaths } from "@/lib/routes";
import {
  SITE_URL,
  languageAlternates,
  ogImagePath,
  pageMetadata,
  resolveBeaconToken,
  resolveSiteUrl,
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
});

describe("pageMetadata", () => {
  it("sets canonical, hreflang alternates and the default share card", () => {
    const meta = pageMetadata({ locale: "id", path: "/labs", title: "Labs", description: "Desc" });
    expect(meta.alternates?.canonical).toBe("/id/labs");
    expect(meta.alternates?.languages).toEqual({ en: "/en/labs", id: "/id/labs", "x-default": "/en/labs" });
    expect(meta.openGraph).toMatchObject({ locale: "id_ID", url: "/id/labs", siteName: "ShinyQ HQ", type: "website" });
    expect(meta.openGraph?.images).toEqual([{ url: "/og/id.png", width: 1200, height: 630, type: "image/png", alt: "Labs" }]);
    expect(meta.twitter).toMatchObject({ card: "summary_large_image", title: "Labs" });
  });

  it("maps the root path without a trailing segment", () => {
    expect(pageMetadata({ locale: "en", path: "/" }).alternates?.canonical).toBe("/en");
  });

  it("supports article cards with a specific image", () => {
    const image = ogImagePath({ kind: "blog", locale: "en", slug: "post" });
    const meta = pageMetadata({ locale: "en", path: "/blog/post", title: "Post", type: "article", publishedTime: "2026-01-02", image });
    expect(meta.openGraph).toMatchObject({ type: "article", publishedTime: "2026-01-02" });
    expect(meta.openGraph?.images).toMatchObject([{ url: "/og/en/blog/post.png" }]);
  });
});

describe("sitemap and robots", () => {
  const paths = allPagePaths();

  it("lists every static page, journey entry, pod and hosted post", () => {
    expect(paths).toContain("/");
    expect(paths).toContain("/quick");
    expect(paths).toHaveLength(7 + floors.careerArchive.entries.length + floors.labs.pods.length + hostedPosts.length);
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

  it("points robots at the sitemap", () => {
    expect(robots()).toMatchObject({ rules: { userAgent: "*", allow: "/" }, sitemap: `${SITE_URL}/sitemap.xml` });
  });
});

describe("JSON-LD", () => {
  it("describes the person with sameAs profile links", () => {
    const person = personJsonLd("en");
    const contact = floors.roof.contact;
    expect(person).toMatchObject({ "@type": "Person", "@id": PERSON_ID, name: getContent().profile.name });
    expect(person.sameAs).toEqual(expect.arrayContaining([contact.linkedin, contact.github]));
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
});

describe("OG images", () => {
  it("covers a default card plus every pod and hosted post in both locales", () => {
    const targets = allOgTargets();
    expect(targets).toHaveLength(2 * (1 + floors.labs.pods.length + hostedPosts.length));
    expect(targets.map(ogImagePath).every((p) => p.startsWith("/og/") && p.endsWith(".png"))).toBe(true);
  });

  it("round-trips route segments", () => {
    for (const target of allOgTargets()) expect(parseOgSegments(ogSegments(target))).toEqual(target);
    expect(parseOgSegments(["xx.png"])).toBeUndefined();
  });
});

describe("Analytics beacon", () => {
  it("renders nothing without a token", () => {
    expect(Analytics({ token: undefined })).toBeNull();
  });

  it("renders the cookieless Cloudflare beacon with SPA tracking", () => {
    const element = Analytics({ token: "0123456789abcdef0123456789abcdef" });
    expect(element?.props.src).toBe("https://static.cloudflareinsights.com/beacon.min.js");
    expect(JSON.parse(element?.props["data-cf-beacon"])).toEqual({ token: "0123456789abcdef0123456789abcdef", spa: true });
  });
});
