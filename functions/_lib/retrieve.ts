import { askLinkTarget } from "../../src/ask/links";
import { ASK_REPO_CITE } from "../../src/ask/protocol";
import { ADJACENT_SOURCE_TYPES, LEAD_ENGAGEMENTS } from "./checks";
import { indexPack } from "./pack-index";
import { isAdjacentQuestion, isLeadQuestion, isPerspectiveQuestion, isSiteQuestion, routedTopic, type RoutedTopic } from "./scope";
import { expandTokens, tokenize } from "./text";
import type { KnowledgeChunk, KnowledgePack } from "./types";
import { cosines, packVectors } from "./vectors";

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
/** Perspective cap of an opinion question (owner decision 2026-10-24): more of his written views reach the context. */
export const OPINION_PERSPECTIVE_CAP = 4;
/** Perspective cap of a civic question (owner decision 2026-10-24): his policy views together make his stance. */
export const CIVIC_PERSPECTIVE_CAP = 4;
/** Chunks a learning or career question gets first (owner decision 2026-10-24): his own path and his written advice. */
export const MENTORING_INCLUDE = ["profile", "perspective-learning-advice", "perspective-keeping-up-with-ai", "career-summary", "certifications"] as const;
const MENTORING_TYPES: ReadonlySet<string> = new Set(["perspective", "post", "education", "career", "certifications", "talk"]);
/** Most perspectives a learning or team answer gets (the included ones count). */
export const ROUTE_PERSPECTIVE_CAP = 4;
/** His written views on teamwork and working style: the sources of a question about his manager, team or clients. */
const TEAM_TAGS = ["teamwork", "work-style"];
/** At most this many case studies (sector-level clients) for a team question that asks about clients. */
export const TEAM_PROJECT_CAP = 2;
/** Added for lead-intent questions (`isLeadQuestion`): the answer ends with an invitation to get in touch. */
export const LEAD_INCLUDE = "contact";
export { LEAD_ENGAGEMENTS };
/** Chunks every adjacent answer gets (owner decision 2026-10-19): who he is and his rules of work, the most general lessons he wrote. */
export const ADJACENT_INCLUDE = ["profile", "principles"] as const;
/** Added to case studies, posts and talks for an adjacent question, so his written views do not crowd them out. */
export const ADJACENT_BOOST = 2;
const ADJACENT_BOOSTED: ReadonlySet<string> = new Set(["project", "post", "talk"]);
/** Most matching past projects or jobs a lead answer is grounded in (owner request: 1 to 3). */
export const LEAD_MATCH_CAP = 3;
/** Most past projects an approach answer outlines (owner decision 2026-10-25; the 2026-10-25 probe showed weak third matches). */
export const APPROACH_MATCH_CAP = 2;
/** Most of his written views an approach answer gets, besides his principles and the engagements view. */
export const APPROACH_PERSPECTIVE_CAP = 2;
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

/** Canonical intent terms (`INTENTS` keys): they say what kind of chunk a question wants, not what it is about. */
export const INTENT_TERMS: ReadonlySet<string> = new Set(Object.keys(INTENTS));

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

/**
 * Question templates that carry no topic ("what does he think about", "apa pendapatnya soal"): BM25 sees one "view"
 * instead, so the perspective intent stays and the topic words decide (owner decision 2026-10-24).
 */
const TEMPLATES: RegExp[] = [
  /\bwhat (?:does|do|did|would) (?:he|kurniadi|you) (?:really |honestly )?(?:think|feel|believe)(?: about| of| on)?\b/gi,
  /\bhow (?:does|do|did|would) (?:he|kurniadi|you) (?:feel|think) (?:about|of|on)\b/gi,
  /\bwhat(?:'s| is| are) (?:his|kurniadi'?s|your) (?:views?|opinions?|takes?|stance|thoughts?|perspective)(?: on| about| of)?\b/gi,
  /\b(?:apa|bagaimana) (?:pendapat|pandangan)(?:nya| kurniadi| dia)?(?: (?:tentang|soal|mengenai|terhadap))?\b/gi,
  /\b(?:pendapat|pandangan)nya (?:tentang|soal|mengenai|terhadap)\b/gi,
];

/** The question as BM25 reads it: templates folded to one "view". */
export function cleanQuery(question: string): string {
  return TEMPLATES.reduce((q, re) => q.replace(re, " view "), question);
}

/** Reciprocal-rank fusion constant (the usual 60) and the scale that makes a first place in one list score 10. */
export const RRF_K = 60;
const RRF_SCALE = 10 * (RRF_K + 1);
/** Least cosine for a chunk to join the semantic ranking, and how many join it (calibrated on the 2026-10-24 probe). */
export const SEMANTIC_FLOOR = 0.45;
export const SEMANTIC_TOP = 8;

export function scoreChunks(pack: KnowledgePack, question: string, semantic?: Float32Array): { chunk: KnowledgeChunk; score: number }[] {
  const lexical = bm25Scores(pack, question);
  const vectors = semantic ? packVectors(pack) : null;
  if (!semantic || !vectors) return lexical;
  // Hybrid (owner decision 2026-10-24): reciprocal-rank fusion of the BM25 ranking and the bge-m3 cosine ranking.
  const cos = cosines(semantic, vectors.rows, vectors.norms, vectors.dims);
  const rankOf = (order: number[]) => new Map(order.map((i, r) => [i, r + 1]));
  const byBm25 = rankOf(lexical.map((r, i) => [r.score, i] as const).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i));
  const bySemantic = rankOf([...cos].map((s, i) => [s, i] as const).filter(([s]) => s >= SEMANTIC_FLOOR).sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, SEMANTIC_TOP).map(([, i]) => i));
  return lexical.map(({ chunk }, i) => {
    const a = byBm25.get(i);
    const b = bySemantic.get(i);
    return { chunk, score: RRF_SCALE * ((a ? 1 / (RRF_K + a) : 0) + (b ? 1 / (RRF_K + b) : 0)) };
  });
}

function bm25Scores(pack: KnowledgePack, question: string): { chunk: KnowledgeChunk; score: number }[] {
  const index = indexPack(pack);
  const terms = [...new Set(expandTokens(tokenize(cleanQuery(question))))];
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

/**
 * The matches an approach answer outlines (owner decision 2026-10-25): with the question's bge-m3 vector, matches whose
 * cosine is under `SEMANTIC_FLOOR` drop out and the rest are ordered by cosine; a match without a stored vector keeps
 * its place at the floor. Without a vector, the BM25 order stays. At most `APPROACH_MATCH_CAP`; empty means a plain lead.
 */
export function approachMatches(pack: KnowledgePack, matches: readonly KnowledgeChunk[], semantic?: Float32Array | null): KnowledgeChunk[] {
  const vectors = semantic ? packVectors(pack) : null;
  if (!semantic || !vectors) return matches.slice(0, APPROACH_MATCH_CAP);
  const sims = cosines(semantic, vectors.rows, vectors.norms, vectors.dims);
  return matches
    .map((chunk) => {
      const i = pack.chunks.indexOf(chunk);
      const s = i >= 0 && vectors.norms[i] ? sims[i] : SEMANTIC_FLOOR;
      return { chunk, s: Number.isFinite(s) ? s : SEMANTIC_FLOOR };
    })
    .filter((r) => r.s >= SEMANTIC_FLOOR)
    .sort((a, b) => b.s - a.s)
    .slice(0, APPROACH_MATCH_CAP)
    .map((r) => r.chunk);
}

export interface RetrieveOptions {
  /** Routed perspective topic (`routedTopic`): only that topic's perspectives, no other chunk but the profile. */
  topic?: RoutedTopic;
  /** Lead intent (`isLeadQuestion`): contact first, then the matching past work and his engagement terms, never other opinions. */
  lead?: boolean;
  /** Bring your problem (owner decision 2026-10-25, with `lead`): these matches, his principles and up to `APPROACH_PERSPECTIVE_CAP` views, nothing else. */
  approach?: readonly KnowledgeChunk[];
  /** Earlier questions a follow-up refers to (`followUpAnchor`): their best chunks come first, so "What stack did it use?" finds the project, not every skill. */
  anchor?: string;
  /** A related professional question (`isAdjacentQuestion`): his principles, then only his case studies, posts, talks, papers and written views. */
  adjacent?: boolean;
  /** A civic question (`civicQuestion`, with `topic` "policy"): up to `CIVIC_PERSPECTIVE_CAP` policy views. */
  civic?: boolean;
  /** A learning or career question (`isMentoringQuestion`): his path, education, certifications and written advice. */
  mentoring?: boolean;
  /** A question about his manager, team or clients (`isTeamQuestion`): his teamwork views and sector-level case studies. */
  team?: boolean;
  /** The question's bge-m3 embedding: hybrid ranking (`scoreChunks`); absent keeps BM25. */
  semantic?: Float32Array;
}

/** Chunks the anchor itself retrieves first (multi-turn memory). */
export const ANCHOR_TOP = 2;

/** BM25 top-k plus the always-included chunks, trimmed to the context budget. */
export function retrieve(pack: KnowledgePack, question: string, locale: "en" | "id", options: RetrieveOptions = { topic: routedTopic(question), lead: isLeadQuestion(question), adjacent: isAdjacentQuestion(question) }): Retrieved {
  const { topic, lead, approach, anchor, adjacent, civic, mentoring, team, semantic } = options;
  const scored = scoreChunks(pack, question, semantic);
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
      .slice(0, civic ? CIVIC_PERSPECTIVE_CAP : PERSPECTIVE_CAP)
      .forEach((r) => add(r.chunk));
  } else if (mentoring) {
    // Learning and career questions: how he learned and grew, and what he wrote about it; never a tutorial.
    MENTORING_INCLUDE.forEach((id) => add(byId(id)));
    let perspectives = picked.filter((c) => c.type === "perspective").length;
    for (const { chunk } of ranked) {
      if (picked.length >= TOP_K + MENTORING_INCLUDE.length - 1) break;
      if (picked.includes(chunk) || !MENTORING_TYPES.has(chunk.type)) continue;
      if (chunk.type === "perspective" && perspectives++ >= ROUTE_PERSPECTIVE_CAP) continue;
      picked.push(chunk);
    }
  } else if (team) {
    // His manager, team and clients: his written views on teamwork, then sector-level case studies when clients come up.
    add(byId("profile"));
    scored
      .filter((r) => r.chunk.type === "perspective" && TEAM_TAGS.some((t) => r.chunk.keywords.includes(t)))
      .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
      .slice(0, ROUTE_PERSPECTIVE_CAP)
      .forEach((r) => add(r.chunk));
    if (/\b(?:clients?|customers?|klien|pelanggan)\w*/i.test(question)) {
      ranked
        .filter((r) => r.chunk.type === "project")
        .slice(0, TEAM_PROJECT_CAP)
        .forEach((r) => add(r.chunk));
    }
  } else if (lead) {
    // Lead intent: who he is, his availability, how to reach him, then matching past work and skills.
    // The engagements view comes before the matches, so long case studies can never clip it out of the budget.
    for (const id of [...ALWAYS_INCLUDE, LEAD_INCLUDE, LEAD_ENGAGEMENTS]) add(byId(id));
    if (approach?.length) {
      // Bring your problem: the outlined matches first, then his principles and the views closest to the question.
      approach.forEach(add);
      add(byId(PERSPECTIVE_INCLUDE));
      scored
        .filter((r) => r.score > 0 && r.chunk.type === "perspective" && r.chunk.id !== LEAD_ENGAGEMENTS && !r.chunk.keywords.includes("personal"))
        .sort((a, b) => b.score - a.score || a.chunk.id.localeCompare(b.chunk.id))
        .slice(0, APPROACH_PERSPECTIVE_CAP)
        .forEach((r) => add(r.chunk));
    } else {
      leadMatches(pack, question).forEach(add);
      const limit = TOP_K + ALWAYS_INCLUDE.length + 2;
      for (const { chunk } of ranked) {
        if (picked.length >= limit) break;
        if (chunk.type === "perspective" || chunk.type === "principle") continue;
        add(chunk);
      }
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
    const opinion = isPerspectiveQuestion(question);
    const always: string[] = [...ALWAYS_INCLUDE, ...(opinion ? [PERSPECTIVE_INCLUDE] : []), ...(isSiteQuestion(question) ? [SITE_INCLUDE] : [])];
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
      if (chunk.type === "perspective" && perspectives++ >= (opinion ? OPINION_PERSPECTIVE_CAP : PERSPECTIVE_CAP)) continue;
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
    // Numbered source tags (owner decision 2026-10-24): the answer cites a line as [S1], [S2], ... (functions/_lib/checks.ts).
    const head = `[S${used.length + 1}] ${body}`;
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
