import { ASK_MAX_TAGS, type AskTag } from "../../src/ask/protocol";
import { ALWAYS_INCLUDE } from "./retrieve";
import type { KnowledgeChunk } from "./types";

/**
 * Topic tags for the `done` frame (follow-up pills). Derived only from chunk types, ids and
 * keywords, mapped onto the `ASK_TAGS` allowlist, so no chunk text ever reaches the browser here.
 */

const BY_TYPE: Record<KnowledgeChunk["type"], AskTag[]> = {
  profile: [],
  now: ["now", "career"],
  stats: ["stats"],
  "live-stats": ["stats", "github"],
  skills: ["skills"],
  certifications: ["certifications", "career"],
  awards: ["awards", "career"],
  career: ["career"],
  education: ["education", "career"],
  project: ["work"],
  post: ["writing"],
  publication: ["research", "ai"],
  talk: ["talks"],
  contact: ["contact"],
  "side-project": ["work"],
  repo: ["work", "github"],
};

/** Topic markers matched on a chunk's id and keywords (lowercase). */
const TOPICS: [AskTag, RegExp][] = [
  ["voice", /\bvoice|speech|realtime|waveform/],
  ["fraud", /fraud/],
  ["documents", /document intelligence|\bdocuments\b|\bocr\b|statement|\bcv\b/],
  ["agents", /\bagents?\b|agent framework|langgraph|spec kit|copilot|claude/],
  ["rag", /ai search|\brag\b|retrieval|elasticsearch/],
  ["security", /security|shield|vulnerab|nessus|governance/],
  ["data", /fabric|forecast|xgboost|lightgbm|lakehouse|\bdata\b|sentiment/],
];

export function chunkTags(chunk: KnowledgeChunk): AskTag[] {
  const tags = [...BY_TYPE[chunk.type]];
  if (chunk.type === "project") {
    const wing = chunk.keywords.includes("ai") ? "ai" : "software";
    tags.push(wing);
  }
  if (chunk.type === "project" || chunk.type === "post" || chunk.type === "side-project") {
    const haystack = `${chunk.id} ${chunk.keywords.join(" ")}`.toLowerCase();
    for (const [tag, re] of TOPICS) if (re.test(haystack)) tags.push(tag);
  }
  return tags;
}

/** Tags of the retrieved chunks, skipping the always-included identity chunks, in retrieval order. */
export function answerTags(chunks: readonly KnowledgeChunk[]): AskTag[] {
  const out = new Set<AskTag>();
  for (const chunk of chunks) {
    if ((ALWAYS_INCLUDE as readonly string[]).includes(chunk.id)) continue;
    for (const tag of chunkTags(chunk)) out.add(tag);
  }
  return [...out].slice(0, ASK_MAX_TAGS);
}
