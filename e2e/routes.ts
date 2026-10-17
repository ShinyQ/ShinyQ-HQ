import { readFileSync } from "node:fs";
import path from "node:path";

interface Content {
  floors: {
    labs: { pods: { slug: string; tier: string; wing: string; liveUrl?: string }[] };
    careerArchive: { entries: { slug: string }[] };
    library: { posts: { slug: string; url?: string }[] };
    roof: { cv: { fileName: string } };
  };
}

export const content: Content = JSON.parse(readFileSync(path.join(process.cwd(), "content", "site-content.json"), "utf8"));
export const LOCALES = ["en", "id"] as const;

export const heroPod = content.floors.labs.pods.find((p) => p.tier === "hero" && p.wing === "ai") ?? content.floors.labs.pods[0];
export const firstEntry = content.floors.careerArchive.entries[0];
export const hostedPost = content.floors.library.posts.find((p) => !p.url);
/** Pods with a public live site (R4-J); `Pod.liveUrl` is allowlisted by the schema. */
export const livePods = content.floors.labs.pods.filter((p) => p.liveUrl);

export function staticRoutes(locale: string): string[] {
  return [
    `/${locale}`,
    `/${locale}/quick`,
    `/${locale}/journey`,
    `/${locale}/journey/${firstEntry.slug}`,
    `/${locale}/labs`,
    `/${locale}/labs/${heroPod.slug}`,
    `/${locale}/library`,
    ...(hostedPost ? [`/${locale}/blog/${hostedPost.slug}`] : []),
    `/${locale}/contact`,
    `/${locale}/cv`,
    `/${locale}/build`,
  ];
}
