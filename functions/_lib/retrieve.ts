import { askLinkTarget } from "../../src/ask/links";
import { ASK_REPO_CITE } from "../../src/ask/protocol";
import { ADJACENT_SOURCE_TYPES } from "./checks";
import { indexPack } from "./pack-index";
import { isAdjacentQuestion, isLeadQuestion, isPerspectiveQuestion, isSiteQuestion, routedTopic, type RoutedTopic } from "./scope";
import { expandTokens, tokenize } from "./text";
import type { KnowledgeChunk, KnowledgePack } from "./types";

/** About 1,500 tokens of context at roughly 4 characters per token. */
export const CONTEXT_CHAR_BUDGET = 6000;
export const TOP_K = 6;
/** Chunks every answer gets: identity and the current role (benchmark q01, q11). */
export const ALWAYS_INCLUDE = ["profile", "now"] as const;
/** Added after the always-included chunks for questions about Kurniadi's views, so the answer has his principles to cite. */
export const PERSPECTIVE_INCLUDE = "principles";
/** Added for questions about this site itself (`isSiteQuestion`): how ShinyQ HQ was built (content/ask/site-build.json). */
export const SITE_INCLUDE = "site-build";
/** Most perspective chunks one answer gets: they all share opinion words, so without a cap they crowd out the posts and projects behind them. */
export const PERSPECTIVE_CAP = 3;
/** Added for lead-intent questions (`isLeadQuestion`): the answer ends with an invitation to get in touch. */
export const LEAD_INCLUDE = "contact";
/** His own words on which freelance or part-time engagements he takes (owner-endorsed perspective), when published. */
export const LEAD_ENGAGEMENTS = "perspective-freelance-engagements";
/** Chunks every adjacent answer gets (owner decision 2026-10-19): who he is and his rules of work, the most general lessons he wrote. */
export const ADJACENT_INCLUDE = ["profile", "principles"] as const;
/** Added to case studies, posts and talks for an adjacent question, so his written views do not crowd them out. */
export const ADJACENT_BOOST = 2;
const ADJACENT_BOOSTED: ReadonlySet<string> = new Set(["project", "post", "talk"]);
/** Most matching past projects or jobs a lead answer is grounded in (owner request: 1 to 3). */
export const LEAD_MATCH_CAP = 3;
/** A lead match needs two specific terms in common, or one specific term with at least this BM25 score. */
export const LEAD_STRONG_SCORE = 4.4;
/** ...and that term appears at least this often in the project chunk. */
export const LEAD_STRONG_TF = 3;
/** Terms in more than this share of chunks are too common to show a fit on their own ("ai", "system"). */
const LEAD_COMMON_SHARE = 0.2;

/** Words every lead question uses: they say nothing about which past work fits. */
const LEAD_STOP = new Set(
  "need needs want wants like looking look plan planning require required build building make making develop developing create help us our company team business startup organization organisation project projects system systems app apps application applications platform website site solution software developer developers engineer engineers programmer freelancer contractor someone work working can could would will you he kurniadi new kami saya kita aku butuh membutuhkan perlu memerlukan mencari cari ingin mau membuat membangun bikin buatkan membuatkan bisa bisakah sistem aplikasi situs solusi proyek perusahaan tim usaha bantu bantuan over contract contractor kontrak internal our dengan untuk re ll ve".split(" "),
);

/**
 * Intent boosts: a question that names a topic (directly or through a synonym, e.g. "kuliah" for
 * education) lifts the chunks of that type above incidental word matches ("case study").
 */
const INTENT_BOOST = 6;
const INTENTS: Record<string, (chunk: KnowledgeChunk) => boolean> = {
  education: (c) => c.type === "education",
  contact: (c) => c.type === "contact",
  certification: (c) => c.type === "certifications",
  award: (c) => c.type === "awards",
  writing: (c) => c.type === "post",
  research: (c) => c.type === "publication",
  career: (c) => c.id === "career-summary" || c.id === "now",
  project: (c) => c.id === "projects-summary",
  now: (c) => c.id === "now",
  stats: (c) => c.type === "stats" || c.type === "live-stats",
  skill: (c) => c.type === "skills",
  perspective: (c) => c.type === "perspective",
};

/** Intents that boost less than INTENT_BOOST: every perspective chunk is an opinion, so the question's own words still decide. */
const INTENT_WEIGHT: Partial<Record<string, number>> = { perspective: 3 };

/** Added per question term that is also a word of a project or post title (2026-10-15: keeps named projects first as the pack grows). */
const TITLE_BOOST = 0.5;
const titleCache = new WeakMap<KnowledgeChunk, string[]>();
const titleTerms = (chunk: KnowledgeChunk): string[] => {
  let hit = titleCache.get(chunk);
  if (!hit) titleCache.set(chunk, (hit = [...new Set(expandTokens(tokenize(chunk.title)))]));
  return hit;
};

const K1 = 1.2;
const B = 0.75;

export interface Retrieved {
  chunks: KnowledgeChunk[];
  /** The context block as given to the model. */
  context: string;
}

export function scoreChunks(pack: KnowledgePack, question: string): { chunk: KnowledgeChunk; score: number }[] {
  const index = indexPack(pack);
  const terms = [...new Set(expandTokens(tokenize(question)))];
  const n = pack.chunks.length;
  // Term at a time over the postings: each chunk still sums its terms in question order, so scores match a per-chunk loop.
  const bm25 = new Float64Array(n);
  for (const term of terms) {
    const postings = index.postingsOf(term);
    const df = postings.size;
    if (!df) continue;
    const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
    for (const [i, tf] of postings) bm25[i] += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * index.len[i]) / index.avgLen));
  }
  return pack.chunks.map((chunk, i) => {
    let score = bm25[i];
    for (const term of terms) if (INTENTS[term]?.(chunk)) score += INTENT_WEIGHT[term] ?? INTENT_BOOST;
    // A project or post named in the question ("the voice AI project") beats one that only shares its words.
    if (score > 0 && (chunk.type === "project" || chunk.type === "post")) score += TITLE_BOOST * titleTerms(chunk).filter((t) => terms.includes(t)).length;
    return { chunk, score };
  });
}

/** Perspective chunks tagged with a routed topic (their tags are chunk keywords). */
export const hasTopic = (chunk: KnowledgeChunk, topic: RoutedTopic) => chunk.type === "perspective" && chunk.keywords.includes(topic);

/**
 * Past projects that fit a lead question, best first (at most `LEAD_MATCH_CAP`): they share at
 * least one specific term with it (in at most a fifth of the chunks, lead stop words removed) and
 * either a second term ("ai" counts here) or, for one term, a BM25 score of at least
 * `LEAD_STRONG_SCORE` with the term repeated `LEAD_STRONG_TF` times. Empty means no real match, and the answer
 * must not claim a fit (functions/_lib/checks.ts).
 */
export function leadMatches(pack: KnowledgePack, question: string): KnowledgeChunk[] {
  const index = indexPack(pack);
  const n = pack.chunks.length;
  const df = (t: string) => index.df.get(t) ?? 0;
  const all = [...new Set(expandTokens(tokenize(question)))].filter((t) => !LEAD_STOP.has(t) && df(t) > 0);
  const specific = new Set(all.filter((t) => df(t) <= n * LEAD_COMMON_SHARE));
  if (!specific.size) return [];
  return pack.chunks
    .map((chunk, i) => {
      if (!(chunk.type === "project" || chunk.type === "side-project") || chunk.id === "projects-summary") return null;
      let score = 0;
      let shared = 0;
      let own = 0;
      let peak = 0;
      for (const term of all) {
        const tf = index.tfOf(i, term);
        if (!tf) continue;
        shared++;
        if (specific.has(term)) {
          own++;
          peak = Math.max(peak, tf);
        }
        const d = df(term);
        score += (Math.log(1 + (n - d + 0.5) / (d + 0.5)) * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * index.len[i]) / index.avgLen));
      }
      // One term alone fits only when the project is about it (repeated), not when it is mentioned once or twice.
      return own >= 1 && (shared >= 2 || (score >= LEAD_STRONG_SCORE && peak >= LEAD_STRONG_TF)) ? { chunk, score } : null;
    })
    .filter((r): r is { chunk: KnowledgeChunk; score: number } => r !== null)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
    .slice(0, LEAD_MATCH_CAP)
    .map((r) => r.chunk);
}

export interface RetrieveOptions {
  /** Routed perspective topic (`routedTopic`): only that topic's perspectives, no other chunk but the profile. */
  topic?: RoutedTopic;
  /** Lead intent (`isLeadQuestion`): contact first, then the matching past work and his engagement terms, never other opinions. */
  lead?: boolean;
  /** Earlier questions a follow-up refers to (`followUpAnchor`): their best chunks come first, so "What stack did it use?" finds the project, not every skill. */
  anchor?: string;
  /** A related professional question (`isAdjacentQuestion`): his principles, then only his case studies, posts, talks, papers and written views. */
  adjacent?: boolean;
}

/** Chunks the anchor itself retrieves first (multi-turn memory). */
export const ANCHOR_TOP = 2;

/** BM25 top-k plus the always-included chunks, trimmed to the context budget. */
export function retrieve(pack: KnowledgePack, question: string, locale: "en" | "id", options: RetrieveOptions = { topic: routedTopic(question), lead: isLeadQuestion(question), adjacent: isAdjacentQuestion(question) }): Retrieved {
  const { topic, lead, anchor, adjacent } = options;
  const scored = scoreChunks(pack, question);
  const ranked = scored.filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
  const picked: KnowledgeChunk[] = [];
  const add = (chunk: KnowledgeChunk | undefined) => {
    if (chunk && !picked.includes(chunk)) picked.push(chunk);
  };
  const byId = (id: string) => pack.chunks.find((c) => c.id === id);

  if (topic) {
    // Lifestyle and tech policy: answerable from his written perspectives on that topic only.
    add(byId("profile"));
    scored
      .filter((r) => hasTopic(r.chunk, topic))
      .sort((a, b) => b.score - a.score)
      .slice(0, PERSPECTIVE_CAP)
      .forEach((r) => add(r.chunk));
  } else if (lead) {
    // Lead intent: who he is, his availability, how to reach him, then matching past work and skills.
    // The engagements view comes before the matches, so long case studies can never clip it out of the budget.
    for (const id of [...ALWAYS_INCLUDE, LEAD_INCLUDE, LEAD_ENGAGEMENTS]) add(byId(id));
    leadMatches(pack, question).forEach(add);
    const limit = TOP_K + ALWAYS_INCLUDE.length + 2;
    for (const { chunk } of ranked) {
      if (picked.length >= limit) break;
      if (chunk.type === "perspective" || chunk.type === "principle") continue;
      add(chunk);
    }
  } else if (adjacent) {
    // Related professional questions: his principles, then his case studies, posts, talks, papers and written views only.
    ADJACENT_INCLUDE.forEach((id) => add(byId(id)));
    let perspectives = 0;
    scored
      .filter((r) => r.score > 0 && ADJACENT_SOURCE_TYPES.has(r.chunk.type))
      .map((r) => ({ chunk: r.chunk, score: r.score + (ADJACENT_BOOSTED.has(r.chunk.type) ? ADJACENT_BOOST : 0) }))
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .forEach(({ chunk }) => {
        if (picked.length >= TOP_K + ADJACENT_INCLUDE.length || picked.includes(chunk)) return;
        if (chunk.type === "perspective" && perspectives++ >= PERSPECTIVE_CAP) return;
        picked.push(chunk);
      });
  } else {
    const always: string[] = [...ALWAYS_INCLUDE, ...(isPerspectiveQuestion(question) ? [PERSPECTIVE_INCLUDE] : []), ...(isSiteQuestion(question) ? [SITE_INCLUDE] : [])];
    always.forEach((id) => add(byId(id)));
    if (anchor) {
      scoreChunks(pack, anchor)
        .filter((r) => r.score > 0 && r.chunk.type !== "perspective")
        .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
        .slice(0, ANCHOR_TOP)
        .forEach((r) => add(r.chunk));
    }
    let perspectives = 0;
    for (const { chunk } of ranked) {
      if (picked.length >= TOP_K + always.length) break;
      if (picked.includes(chunk)) continue;
      if (chunk.type === "perspective" && perspectives++ >= PERSPECTIVE_CAP) continue;
      picked.push(chunk);
    }
  }

  let budget = CONTEXT_CHAR_BUDGET;
  const lines: string[] = [];
  const used: KnowledgeChunk[] = [];
  for (const chunk of picked) {
    if (budget <= 200) break;
    const body = locale === "id" ? chunk.text_id : chunk.text_en;
    const dated = chunk.updatedAt ? ` [as of ${chunk.updatedAt}]` : "";
    // The chunk's page, for an answer's markdown link (the output check keeps only these and the top pages).
    const target = chunk.url ? askLinkTarget(chunk.url) : null;
    const link = target?.kind === "site" || (target?.kind === "external" && target.href === ASK_REPO_CITE) ? ` [link: ${chunk.url}]` : "";
    const head = `- ${body}`;
    const line = `${head}${dated}`;
    // A clipped line keeps its date: the body is cut, never the annotation.
    const clipped = line.length > budget ? `${head.slice(0, Math.max(0, budget - dated.length - 4)).replace(/\s+\S*$/, "")}...${dated}` : line;
    // Link notes ride outside the budget (short, one per chunk), so retrieval matches the plain context.
    lines.push(`${clipped}${link}`);
    used.push(chunk);
    budget -= clipped.length + 1;
  }
  return { chunks: used, context: lines.join("\n") };
}
