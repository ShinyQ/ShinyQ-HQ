import { createHash } from "node:crypto";
import type { DynamicFacts } from "@/content/dynamic-facts";
import type { Locale, LocalizedText, Perspective, Pod, SiteBuild, SiteContent } from "@/content/schema";
import { perspectiveSourcePath } from "@/content/perspectives";
import { findBlockedLabels } from "@/content/safety";
import { overlayStats } from "@/content/load";
import { clientLabel, podLiveLink } from "@/content/selectors";
import { topicTagsOf } from "../../functions/_lib/tags";
import { isAskContact } from "./protocol";
import { cleanText, isInstructionLike } from "../../functions/_lib/text";
import type { ChunkType, KnowledgeChunk, KnowledgePack } from "../../functions/_lib/types";
import en from "../../messages/en.json";
import id from "../../messages/id.json";

/**
 * Builds the Ask the HQ knowledge pack (spec section 4) from public site content only: never the
 * CV PDF, never private evidence. Pure: the script (scripts/build-knowledge.ts) does the I/O.
 */

/**
 * Pack size cap. 200 KB until 2026-10-15, then 256 KiB (owner pre-approved) for the 30 endorsed
 * lifestyle, industry and policy perspectives, after measuring isolate start-up, memory and bundle
 * size (docs/ask-runbook.md section 15, "Pack budget").
 */
export const PACK_MAX_BYTES = 256 * 1024;

/**
 * Approach steps per project chunk by tier. The case study page keeps every step; the pack keeps
 * the lead steps of featured and listed pods so the pack stays under its cap with every
 * perspective approved (runbook deviation 8). Answers get at most 6,000 characters of context anyway.
 */
export const PACK_APPROACH_STEPS = { hero: Infinity, featured: 1, listed: 1 } as const satisfies Record<Pod["tier"], number>;
/** Data and ML pods (academic and competition work, owner request 2026-10-14) keep their lead step only. */
export const PACK_DATA_APPROACH_STEPS = 1;

/** Approach steps a project chunk keeps (the case study page keeps every step). */
export function packApproachSteps(pod: Pick<Pod, "tier" | "wing">): number {
  return pod.wing === "data" ? Math.min(PACK_DATA_APPROACH_STEPS, PACK_APPROACH_STEPS[pod.tier]) : PACK_APPROACH_STEPS[pod.tier];
}
/** Lead paragraphs of a hosted post body after its excerpt (2 until the Data and ML pods, 2026-10-14). */
export const POST_LEAD_PARAGRAPHS = 1;
export const REQUIRED_CHUNKS = ["profile", "now", "contact"] as const;
/** Id of the chunk built from content/ask/site-build.json (`SITE_INCLUDE` in functions/_lib/retrieve.ts). */
export const SITE_CHUNK = "site-build";
/** The page the site chunk is cited to (the How this site was built page; it links the public repository). */
export const SITE_BUILD_PAGE = "/build";

export interface PackSources {
  content: SiteContent;
  facts?: DynamicFacts;
  /** Hosted blog post bodies (MDX source) by slug and locale. */
  posts?: Partial<Record<string, Partial<Record<Locale, string>>>>;
  /** Last content change (YYYY-MM-DD), e.g. the git date of content/. */
  contentDate: string;
  /** Product names allowed on the site (content/safety-allowlist.txt). */
  products: readonly string[];
  /** Approved perspectives only (`getPerspectives()`); drafts never enter the pack. */
  perspectives?: readonly Perspective[];
  /** How this site was built (`getSiteBuild()`, content/ask/site-build.json). */
  siteBuild?: SiteBuild;
}

type Bi = { en: string; id: string };

const both = (en: string, id = en): Bi => ({ en, id });
const loc = (text: LocalizedText | undefined): Bi => (text ? { en: text.en, id: text.id } : both(""));
/** Display names of the L3 wings (messages `common.wing`), the same in both locales. */
const WING_NAME: Record<Pod["wing"], Bi> = { software: both("Product Engineering"), ai: both("AI Engineering"), data: both("Data and ML", "Data dan ML") };
const WING_SHORT: Record<Pod["wing"], string> = { software: "software", ai: "AI", data: "data and ML" };
/** Retrieval words for pods with a public live site (R4-J). The hostname itself never enters the pack: Ask output checks block Azure hostnames. */
const LIVE_KEYWORDS = ["live", "site", "sites", "website", "websites", "situs"];
/** The actual About section title, quoted in the pack so answers cite the same source. */
const HOW_TITLE = { en: en.home.howTitle, id: id.home.howTitle };
const join = (parts: (Bi | string | undefined | false)[], sep = " "): Bi => {
  const list = parts.filter((p): p is Bi | string => Boolean(p)).map((p) => (typeof p === "string" ? both(p) : p));
  return {
    en: list.map((p) => p.en).filter(Boolean).join(sep),
    id: list.map((p) => p.id).filter(Boolean).join(sep),
  };
};
const label = (en: string, id: string, value: Bi | string): Bi => {
  const v = typeof value === "string" ? both(value) : value;
  return { en: `${en}: ${v.en}.`, id: `${id}: ${v.id}.` };
};

/** Strips markdown/HTML/JSX, invisible characters and instruction-like sentences. */
export function sanitizePackText(text: string): string {
  const plain = text
    .replace(/<\/?[A-Za-z][^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*`#|]/g, " ")
    .replace(/(^|\s)>\s/g, " ");
  const cleaned = cleanText(plain);
  return cleaned
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !isInstructionLike(sentence))
    .join(" ")
    .replace(/\u2014/g, ", ");
}

/** First `count` prose paragraphs of an MDX body (frontmatter, headings, lists, code, tables and JSX skipped). */
export function leadParagraphs(mdx: string, count = 2): string {
  const body = mdx.replace(/^---[\s\S]*?\n---\s*\n/, "").replace(/```[\s\S]*?```/g, "");
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter((block) => block && !/^(#|-|\*|\d+\.|\||<|import |export |>|!\[)/.test(block))
    .slice(0, count)
    .join(" ");
}

interface Draft {
  id: string;
  type: ChunkType;
  title: string;
  text: Bi;
  updatedAt?: string;
  url?: string;
  keywords?: string[];
}

/**
 * Retrieval keywords of a project chunk's stack. The chunk text already lists the whole stack
 * ("Stack: ..."), so only the names that carry a topic tag (`topicTagsOf`: follow-up pills) stay
 * keywords; repeating the rest only filled the pack (runbook deviation 8, 2026-10-15).
 */
export function stackKeywords(stack: readonly string[]): string[] {
  return stack.map((s) => s.toLowerCase()).filter((s) => topicTagsOf(s).length > 0);
}

function drafts({ content, facts, posts = {}, products, perspectives = [], siteBuild }: PackSources): Draft[] {
  const out: Draft[] = [];
  const { profile } = content;
  const roof = content.floors.roof;
  const contact = roof.contact;
  const entries = content.floors.careerArchive.entries;

  out.push({
    id: "profile",
    type: "profile",
    title: profile.name,
    url: "/",
    keywords: ["kurniadi", "shinyq", "nickname", "panggilan", "profile", "about", "bio", "who"],
    text: join([
      both(`${profile.name} (handle ${profile.handle}).`),
      // Owner request 2026-10-16: "ShinyQ" is his nickname; ShinyQ HQ is the site.
      {
        en: `Kurniadi also goes by the nickname ${profile.handle} (his GitHub handle); ${profile.handle} HQ is his site.`,
        id: `Kurniadi juga dikenal dengan nama panggilan ${profile.handle} (nama akun GitHub-nya); ${profile.handle} HQ adalah situsnya.`,
      },
      loc(profile.headline),
      loc(profile.subheadline),
      loc(profile.bio),
      label("Location", "Lokasi", loc(profile.location)),
    ]),
  });

  // His own principles, cited by perspective answers (spec section 13). Titles are quoted so the
  // source check can match them.
  out.push({
    id: "principles",
    type: "principle",
    title: HOW_TITLE.en,
    url: "/contact#how",
    keywords: ["principles", "principle", "approach", "values", "how", ...profile.principles.map((p) => p.id)],
    text: join([
      {
        en: `Kurniadi's principles, in his own words, from "${HOW_TITLE.en}" on the About page:`,
        id: `Prinsip Kurniadi, dengan kata-katanya sendiri, dari "${HOW_TITLE.id}" di halaman About:`,
      },
      loc(profile.howIWork),
      join(profile.principles.map((p) => ({ en: `"${p.title.en}": ${p.text.en}`, id: `"${p.title.id}": ${p.text.id}` }))),
    ]),
  });

  // How this site was built (owner request 2026-10-15): Ask knowledge, cited to the /build page.
  if (siteBuild) {
    out.push({
      id: SITE_CHUNK,
      type: "site",
      title: siteBuild.title.en,
      url: SITE_BUILD_PAGE,
      updatedAt: siteBuild.asOf,
      keywords: siteBuild.keywords,
      text: loc(siteBuild.text),
    });
  }

  // "How I run AI in production" (owner approved 2026-10-14): the About section and the L3 Ops Control Room.
  const production = content.production;
  out.push({
    id: "production",
    type: "production",
    title: production.title.en,
    url: "/contact#production",
    keywords: ["observability", "monitoring", "telemetry", "opentelemetry", "grafana", "prometheus", "application insights", "azure monitor", "alerts", "bicep", "production", "ops"],
    text: join([
      {
        en: `Kurniadi, "${production.title.en}" (About page):`,
        id: `Kurniadi, "${production.title.id}" (halaman About):`,
      },
      loc(production.intro),
      join(production.points.map((p) => ({ en: `${p.lead.en} ${p.text.en}`, id: `${p.lead.id} ${p.text.id}` }))),
      loc(production.outro),
      join(production.tiles.map((t) => ({ en: `${t.label.en}: ${t.value.en} ${t.detail.en}.`, id: `${t.label.id}: ${t.value.id} ${t.detail.id}.` }))),
    ]),
  });

  out.push({
    id: "now",
    type: "now",
    title: "Now",
    url: "/contact",
    updatedAt: profile.currentRole.since,
    keywords: ["now", "current", "currently", "today", "role", "career", "available", "availability", "location"],
    text: join([
      {
        en: `Current role: ${profile.currentRole.title.en} at ${profile.currentRole.org} since ${profile.currentRole.since}.`,
        id: `Peran saat ini: ${profile.currentRole.title.id} di ${profile.currentRole.org} sejak ${profile.currentRole.since}.`,
      },
      label("Based in", "Berdomisili di", loc(profile.location)),
      label("Availability", "Ketersediaan", loc(roof.availability)),
    ]),
  });

  out.push({
    id: "stats",
    type: "stats",
    title: "Stats",
    url: "/",
    keywords: ["stats", "numbers", "results"],
    // Same numbers as the stats ring and the Page View (live facts overlaid).
    text: join((facts ? overlayStats(content.stats, facts) : content.stats).map((s) => join([both(s.value), loc(s.label)], " ")), "; "),
  });

  for (const group of content.skills) {
    out.push({
      id: `skills-${group.id}`,
      type: "skills",
      title: group.label.en,
      url: "/contact",
      keywords: ["skill", ...group.items.map((i) => i.toLowerCase())],
      text: join([label("Skills", "Keahlian", loc(group.label)), both(group.items.join(", ") + ".")]),
    });
  }

  out.push({
    id: "certifications",
    type: "certifications",
    title: "Certifications",
    url: "/contact",
    keywords: ["certification", "microsoft", "azure", ...content.certifications.flatMap((c) => (c.code ? [c.code.toLowerCase()] : []))],
    text: join(
      content.certifications.map((c) => ({
        en: `${c.name}${c.code ? ` (${c.code})` : ""} by ${c.issuer}, ${c.status === "earned" ? `earned ${c.issued}${c.expires ? `, valid until ${c.expires}` : ""}` : c.status === "expired" ? `earned ${c.issued}, expired${c.expires ? ` ${c.expires}` : ""}` : `in progress, planned ${c.issued}`}.`,
        id: `${c.name}${c.code ? ` (${c.code})` : ""} dari ${c.issuer}, ${c.status === "earned" ? `diraih ${c.issued}${c.expires ? `, berlaku hingga ${c.expires}` : ""}` : c.status === "expired" ? `diraih ${c.issued}, kedaluwarsa${c.expires ? ` ${c.expires}` : ""}` : `sedang berjalan, direncanakan ${c.issued}`}.`,
      })),
    ),
  });

  out.push({
    id: "awards",
    type: "awards",
    title: "Awards",
    url: "/journey",
    keywords: ["award", "competition", "hackathon"],
    text: join(
      content.awards.map((a) => join([both(a.title), loc(a.placement), a.organizer && both(`(${a.organizer})`), both(`${a.date}.`)], " ")),
    ),
  });

  const jobs = entries.filter((e) => e.type === "job" || e.type === "freelance");
  out.push({
    id: "career-summary",
    type: "career",
    title: "Career summary",
    url: "/journey",
    keywords: ["career", "companies", "employers", "jobs", "history", "timeline"],
    text: join([
      { en: "Jobs and freelance work, oldest first:", id: "Pekerjaan dan freelance, dari yang terlama:" },
      join(
        jobs.map((e) => ({
          en: `${e.org}, ${e.role.en} (${e.type}, ${e.start} to ${e.end}).`,
          id: `${e.org}, ${e.role.id} (${e.type}, ${e.start} hingga ${e.end === "present" ? "sekarang" : e.end}).`,
        })),
      ),
    ]),
  });

  const pods = content.floors.labs.pods;
  out.push({
    id: "projects-summary",
    type: "project",
    title: "Projects summary",
    url: "/labs",
    keywords: ["project", "projects", "portfolio", "best", "hero"],
    text: join([
      { en: "Projects (AI Engineering, Product Engineering, and Data and ML), highlighted ones first:", id: "Proyek (AI Engineering, Product Engineering, serta Data dan ML), yang utama lebih dulu:" },
      join(
        [...pods]
          .sort((a, b) => ["hero", "featured", "listed"].indexOf(a.tier) - ["hero", "featured", "listed"].indexOf(b.tier) || a.order - b.order)
          .map((p) => ({ en: `${p.title.en} (${WING_SHORT[p.wing]}, ${p.tier}).`, id: `${p.title.id} (${WING_SHORT[p.wing]}, ${p.tier}).` })),
      ),
    ]),
  });

  for (const e of entries) {
    if (e.type === "award") continue;
    const type: ChunkType = e.type === "education" ? "education" : "career";
    const kind = { job: ["Job", "Pekerjaan"], freelance: ["Freelance", "Freelance"], education: ["Education", "Pendidikan"], milestone: ["Milestone", "Pencapaian"] }[
      e.type
    ] ?? ["Entry", "Entri"];
    out.push({
      id: `career-${e.slug}`,
      type,
      title: `${e.role.en}, ${e.org}`,
      url: `/journey/${e.slug}`,
      updatedAt: e.end === "present" ? e.start : e.end,
      keywords: [e.type === "education" ? "education" : "career", e.org, ...e.stack],
      text: join([
        {
          en: `${kind[0]}: ${e.role.en} at ${e.org} (${e.start} to ${e.end === "present" ? "present" : e.end}).`,
          id: `${kind[1]}: ${e.role.id} di ${e.org} (${e.start} hingga ${e.end === "present" ? "sekarang" : e.end}).`,
        },
        loc(e.summary),
        join(e.highlights.map(loc)),
        e.stack.length > 0 && label("Stack", "Stack", e.stack.slice(0, 10).join(", ")),
      ]),
    });
  }

  for (const pod of content.floors.labs.pods) {
    const client = pod.client ? { en: clientLabel(pod.client, "en") ?? "", id: clientLabel(pod.client, "id") ?? "" } : undefined;
    const live = podLiveLink(pod);
    out.push({
      id: `project-${pod.slug}`,
      type: "project",
      title: pod.title.en,
      url: `/labs/${pod.slug}`,
      updatedAt: pod.period.end === "present" ? pod.period.start : pod.period.end,
      keywords: ["project", pod.wing, ...stackKeywords(pod.stack), pod.hologram, ...(live ? LIVE_KEYWORDS : [])],
      text: join([
        {
          en: `Project (${WING_NAME[pod.wing].en}): ${pod.title.en}, ${pod.period.start} to ${pod.period.end}.`,
          id: `Proyek (${WING_NAME[pod.wing].id}): ${pod.title.id}, ${pod.period.start} hingga ${pod.period.end === "present" ? "sekarang" : pod.period.end}.`,
        },
        // No tagline: the problem says it in full (runbook deviation 8, 2026-10-14).
        client && label("For", "Untuk", client),
        label("Role", "Peran", loc(pod.role)),
        label("Problem", "Masalah", loc(pod.problem)),
        join([{ en: "Approach:", id: "Pendekatan:" }, ...pod.approach.slice(0, packApproachSteps(pod)).map(loc)]),
        join([
          { en: "Results:", id: "Hasil:" },
          ...pod.results.map((r) =>
            join([both(r.value), loc(r.label), r.context && { en: `(${r.context.en})`, id: `(${r.context.id})` }], " "),
          ),
        ]),
        label("Stack", "Stack", pod.stack.join(", ")),
        live ? { en: "Live site: public; the case study page links to it.", id: "Situs live: publik; halaman studi kasus menautkannya." } : undefined,
      ]),
    });
  }

  const library = content.floors.library;
  const latestPost = [...library.posts].sort((a, b) => b.date.localeCompare(a.date))[0];
  for (const post of library.posts) {
    const body = posts[post.slug] ?? {};
    out.push({
      id: `post-${post.slug}`,
      type: "post",
      title: post.title.en,
      url: post.url ? undefined : `/blog/${post.slug}`,
      updatedAt: post.date,
      keywords: ["writing", ...post.tags],
      text: join([
        {
          en: `${post === latestPost ? "Latest blog post" : "Post"} "${post.title.en}" (${post.date}).`,
          id: `${post === latestPost ? "Tulisan blog terbaru" : "Tulisan"} "${post.title.id}" (${post.date}).`,
        },
        loc(post.excerpt),
        // One lead paragraph after the excerpt keeps the pack under its cap (runbook deviation 8).
        { en: body.en ? leadParagraphs(body.en, POST_LEAD_PARAGRAPHS) : "", id: body.id ? leadParagraphs(body.id, POST_LEAD_PARAGRAPHS) : body.en ? leadParagraphs(body.en, POST_LEAD_PARAGRAPHS) : "" },
      ]),
    });
  }

  for (const p of perspectives) {
    out.push({
      id: `perspective-${p.id}`,
      type: "perspective",
      title: p.question.en,
      // Ask cites the backing post or project; an entry without one is cited by nothing (no page of its own).
      url: perspectiveSourcePath(p, content),
      updatedAt: p.asOf,
      keywords: ["perspective", ...p.tags],
      // A fact from outside the site names its public source (the URL stays in content/perspectives.json).
      text: {
        en: `Kurniadi's written view "${p.question.en.replace(/"/g, "")}": ${p.answer.en}${p.references ? ` Reference: ${p.references.map((r) => r.label).join("; ")}.` : ""}`,
        id: `Pandangan tertulis Kurniadi "${p.question.id.replace(/"/g, "")}": ${p.answer.id}${p.references ? ` Referensi: ${p.references.map((r) => r.label).join("; ")}.` : ""}`,
      },
    });
  }

  for (const pub of library.publications) {
    out.push({
      id: `publication-${pub.id}`,
      type: "publication",
      title: pub.title,
      url: "/library",
      updatedAt: pub.date ?? String(pub.year),
      keywords: ["research", pub.kind],
      text: join([
        { en: `${pub.kind === "model" || pub.kind === "dataset" ? "Model or dataset" : "Research"} (${pub.kind}): "${pub.title}", ${pub.year}.`, id: `Riset (${pub.kind}): "${pub.title}", ${pub.year}.` },
        pub.venue && label("Venue", "Venue", pub.venue),
        pub.authors && label("Authors", "Penulis", pub.authors.join(", ")),
        pub.citations !== undefined && label("Citations", "Sitasi", String(pub.citations)),
        loc(pub.summary),
        pub.document && {
          en: `The full text can be read on the site (${pub.document.version === "manuscript" ? "authors' manuscript" : pub.document.version === "redacted" ? "personal data redacted" : "published version"}).`,
          id: `Teks lengkapnya bisa dibaca di situs ini (${pub.document.version === "manuscript" ? "naskah penulis" : pub.document.version === "redacted" ? "data pribadi disamarkan" : "versi terbit"}).`,
        },
      ]),
    });
  }
  if (library.researchMetrics) {
    const m = library.researchMetrics;
    out.push({
      id: "research-metrics",
      type: "publication",
      title: "Research metrics",
      url: "/library",
      updatedAt: m.asOf,
      keywords: ["research", "citations", "scholar"],
      text: {
        en: `Research metrics from ${m.source} as of ${m.asOf}: ${m.citations} citations, h-index ${m.hIndex}.`,
        id: `Metrik riset dari ${m.source} per ${m.asOf}: ${m.citations} sitasi, h-index ${m.hIndex}.`,
      },
    });
  }

  for (const talk of library.talks) {
    out.push({
      id: `talk-${talk.id}`,
      type: "talk",
      title: talk.title.en,
      url: "/library",
      updatedAt: talk.date,
      keywords: ["talk", "speaker", talk.role],
      text: join([{ en: `Talk (${talk.role}): ${talk.title.en}, ${talk.date}.`, id: `Talk (${talk.role}): ${talk.title.id}, ${talk.date}.` }, both(talk.event + ".")]),
    });
  }

  const channels = [
    `Email: ${contact.email}`,
    `LinkedIn: ${contact.linkedin}`,
    `GitHub: ${contact.github}`,
    contact.huggingface && `Hugging Face: ${contact.huggingface}`,
    contact.medium && `Medium: ${contact.medium}`,
    contact.googleScholar && `Google Scholar: ${contact.googleScholar}`,
  ].filter(Boolean);
  out.push({
    id: "contact",
    type: "contact",
    title: "Contact",
    url: "/contact",
    keywords: ["contact", "email", "linkedin", "github", "hire"],
    text: {
      en: `How to contact Kurniadi: ${channels.join("; ")}. ${roof.availability.en}`,
      id: `Cara menghubungi Kurniadi: ${channels.join("; ")}. ${roof.availability.id}`,
    },
  });

  // Repositories a project pod links (`Pod.repos`) are told by its project chunk: their side project
  // chunk is skipped and their repo line keeps only name, language and stars (runbook deviation 8).
  const podRepos = new Set(content.floors.labs.pods.flatMap((p) => p.repos ?? []));
  for (const sp of content.sideProjects) {
    if (sp.repo && podRepos.has(sp.repo)) continue;
    out.push({
      id: `side-${sp.id}`,
      type: "side-project",
      title: sp.title,
      url: "/labs",
      updatedAt: sp.year ? String(sp.year) : undefined,
      keywords: ["project", "side", ...sp.stack.map((s) => s.toLowerCase())],
      text: join([{ en: `Side project: ${sp.title}${sp.year ? ` (${sp.year})` : ""}.`, id: `Side project: ${sp.title}${sp.year ? ` (${sp.year})` : ""}.` }, loc(sp.summary), label("Stack", "Stack", sp.stack.join(", "))]),
    });
  }

  // Unstarred repositories stay on GitHub only: keeps the pack under its cap with every perspective approved (runbook deviation 8).
  const repos = content.publicRepos.filter((r) => r.stars > 0).sort((a, b) => b.stars - a.stars);
  out.push({
    id: "repos",
    type: "repo",
    title: "Public repositories",
    url: "/labs",
    keywords: ["github", "repository", "repositories", "repo", "repos", "open", "source"],
    text: join([
      { en: "Public GitHub repositories:", id: "Repositori GitHub publik:" },
      join(repos.map((r) => (podRepos.has(r.url) ? both(`${r.name} (${r.language}, ${r.stars} stars).`) : join([both(`${r.name} (${r.language}, ${r.stars} stars):`), loc(r.description)], " ")))),
    ]),
  });

  if (facts) {
    const parts: Bi[] = [];
    if (facts.github) {
      parts.push({
        en: `GitHub ${facts.github.login}: ${facts.github.contributionsLastYear.toLocaleString("en-US")} contributions in the last 365 days, ${facts.github.publicRepos} public repositories.`,
        id: `GitHub ${facts.github.login}: ${facts.github.contributionsLastYear.toLocaleString("en-US")} kontribusi dalam 365 hari terakhir, ${facts.github.publicRepos} repositori publik.`,
      });
    }
    if (facts.huggingface) {
      parts.push({
        en: `Hugging Face ${facts.huggingface.user}: ${facts.huggingface.models} models, ${facts.huggingface.downloads} downloads in total.`,
        id: `Hugging Face ${facts.huggingface.user}: ${facts.huggingface.models} model, total ${facts.huggingface.downloads} unduhan.`,
      });
    }
    out.push({
      id: "live-stats",
      type: "live-stats",
      title: `Live stats as of ${facts.asOf}`,
      url: "/",
      updatedAt: facts.asOf,
      keywords: ["stats", "github", "contributions", "hugging", "face", "models", "live"],
      text: join([{ en: `Live stats as of ${facts.asOf}.`, id: `Statistik terkini per ${facts.asOf}.` }, ...parts]),
    });
  }

  void products;
  return out;
}

/** Builds the pack. Throws when a draft is empty; run `validatePack` for the safety checks. */
export function buildKnowledgePack(sources: PackSources): KnowledgePack {
  const chunks: KnowledgeChunk[] = drafts(sources).map((d) => {
    const text_en = sanitizePackText(d.text.en);
    const text_id = sanitizePackText(d.text.id || d.text.en);
    if (!text_en) throw new Error(`Knowledge chunk "${d.id}" is empty`);
    const keywords = [...new Set((d.keywords ?? []).map((k) => cleanText(k)).filter(Boolean))];
    const chunk: KnowledgeChunk = { id: d.id, type: d.type, title: cleanText(d.title), text_en, text_id, keywords };
    if (d.updatedAt) chunk.updatedAt = d.updatedAt;
    if (d.url) chunk.url = d.url;
    return chunk;
  });

  const { content, facts, contentDate, products } = sources;
  const packDate = [contentDate, facts?.asOf].filter((d): d is string => Boolean(d)).sort().at(-1) ?? contentDate;
  const employers = content.floors.careerArchive.entries.filter((e) => e.type === "job" || e.type === "freelance" || e.type === "education").map((e) => e.org);
  const clients = content.floors.labs.pods.flatMap((p) => (typeof p.client === "string" ? [p.client] : []));
  const entities = [...new Set([...employers, ...clients, ...products].map((name) => cleanText(name)))].sort();
  const orgs = [...new Set([...employers, ...clients].map((name) => cleanText(name)))].sort();
  const contact = { email: content.floors.roof.contact.email, linkedin: content.floors.roof.contact.linkedin };
  const body = { packDate, chunks, entities, orgs, contact };
  const packVersion = createHash("sha256").update(JSON.stringify(body)).digest("hex").slice(0, 16);
  return { packVersion, ...body };
}

/** Build-time gates (spec section 4): no blocklisted term, size cap, required chunks present. */
export function validatePack(pack: KnowledgePack, blocklist: readonly string[]): string[] {
  const errors: string[] = [];
  for (const id of REQUIRED_CHUNKS) if (!pack.chunks.some((c) => c.id === id)) errors.push(`missing required chunk "${id}"`);
  const bytes = Buffer.byteLength(JSON.stringify(pack), "utf8");
  if (bytes > PACK_MAX_BYTES) errors.push(`pack is ${bytes} bytes, over the ${PACK_MAX_BYTES} byte cap`);
  for (const chunk of pack.chunks) {
    const hits = findBlockedLabels([chunk.title, chunk.text_en, chunk.text_id, chunk.keywords.join(" ")].join("\n"), blocklist);
    if (hits.length) errors.push(`chunk "${chunk.id}" contains blocklisted terms: ${hits.join(", ")}`);
    if (/\u2014/.test(chunk.text_en + chunk.text_id)) errors.push(`chunk "${chunk.id}" contains an em dash`);
  }
  if (!isAskContact(pack.contact)) errors.push("contact card (roof.contact email and LinkedIn) is not a valid AskContact");
  const entityHits = findBlockedLabels(pack.entities.join("\n"), blocklist);
  if (entityHits.length) errors.push(`entity allowlist contains blocklisted terms: ${entityHits.join(", ")}`);
  return errors;
}
