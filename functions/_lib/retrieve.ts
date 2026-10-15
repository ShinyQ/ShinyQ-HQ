import { indexPack } from "./pack-index";
import { isPerspectiveQuestion, isSiteQuestion } from "./scope";
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
  return pack.chunks.map((chunk, i) => {
    let score = 0;
    for (const term of terms) {
      const df = index.df[term];
      const tf = index.tf[i][term];
      if (!df || !tf) continue;
      const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
      score += (idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * index.len[i]) / index.avgLen));
    }
    for (const term of terms) if (INTENTS[term]?.(chunk)) score += INTENT_WEIGHT[term] ?? INTENT_BOOST;
    return { chunk, score };
  });
}

/** BM25 top-k plus the always-included chunks, trimmed to the context budget. */
export function retrieve(pack: KnowledgePack, question: string, locale: "en" | "id"): Retrieved {
  const ranked = scoreChunks(pack, question)
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id));
  const always: string[] = [...ALWAYS_INCLUDE, ...(isPerspectiveQuestion(question) ? [PERSPECTIVE_INCLUDE] : []), ...(isSiteQuestion(question) ? [SITE_INCLUDE] : [])];
  const picked: KnowledgeChunk[] = [];
  for (const id of always) {
    const chunk = pack.chunks.find((c) => c.id === id);
    if (chunk) picked.push(chunk);
  }
  let perspectives = 0;
  for (const { chunk } of ranked) {
    if (picked.length >= TOP_K + always.length) break;
    if (picked.includes(chunk)) continue;
    if (chunk.type === "perspective" && perspectives++ >= PERSPECTIVE_CAP) continue;
    picked.push(chunk);
  }

  let budget = CONTEXT_CHAR_BUDGET;
  const lines: string[] = [];
  const used: KnowledgeChunk[] = [];
  for (const chunk of picked) {
    if (budget <= 200) break;
    const body = locale === "id" ? chunk.text_id : chunk.text_en;
    const dated = chunk.updatedAt ? ` [as of ${chunk.updatedAt}]` : "";
    const line = `- ${body}${dated}`;
    const clipped = line.length > budget ? `${line.slice(0, budget - 1).replace(/\s+\S*$/, "")}...` : line;
    lines.push(clipped);
    used.push(chunk);
    budget -= clipped.length + 1;
  }
  return { chunks: used, context: lines.join("\n") };
}
