/**
 * L4 Topic Constellation (owner request 2026-10-14): the explicit maps behind `buildTopicIndex`. No new
 * content: every topic names existing post tags (`TOPIC_TAGS`, synonyms and narrower tags fold into one
 * topic) or words already in the item titles; papers, models and talks carry no tags, so they map by id
 * (`ITEM_TOPICS`). `tests/unit/topic-index.test.ts` fails on a post tag in no topic, an item without a
 * topic, or a stale entry. Labels live in messages (`library.topics.names.<slug>`).
 */

/** Orbit order of the constellation (also the drawer, Cmd-K and Classic filter order). */
export const TOPICS = [
  "llm-evaluation",
  "azure-openai",
  "voice-ai",
  "llm-reliability",
  "fraud-detection",
  "ai-agents",
  "sentiment-analysis",
  "forecasting",
  "teaching",
  "nodejs",
  "ui-ux",
  "case-study",
  "personal",
] as const;

export type TopicSlug = (typeof TOPICS)[number];

/** Post tags per topic. A tag belongs to one topic at most. */
export const TOPIC_TAGS: Record<TopicSlug, readonly string[]> = {
  "llm-evaluation": ["llm-evaluation", "evaluation", "shadow-mode", "testing"],
  "azure-openai": ["azure-openai", "azure-openai-realtime"],
  "voice-ai": ["voice-ai", "latency"],
  "llm-reliability": ["llm-reliability", "structured-output"],
  "fraud-detection": ["fraud-detection"],
  "ai-agents": ["ai-coding-agents", "spec-driven-development", "github-spec-kit", "code-review"],
  "sentiment-analysis": [],
  forecasting: [],
  teaching: ["tutorial"],
  nodejs: ["nodejs", "express", "mysql"],
  "ui-ux": ["ui-ux", "design"],
  "case-study": ["case-study"],
  personal: ["personal", "growth"],
};

/**
 * Post tags left out of the constellation on purpose: product and platform names of the Clearbox post
 * (2026-10-16), which reaches the constellation through `evaluation` and `case-study`. No topic names them.
 */
export const TOPIC_SKIP_TAGS: ReadonlySet<string> = new Set<string>(["microsoft-decision-1", "microsoft-foundry", "cloudflare-workers"]);

/** Papers, theses, models and talks (no tags in content) by id. */
export const ITEM_TOPICS: Record<string, readonly TopicSlug[]> = {
  "ewallet-sentiment-cnn-lstm": ["sentiment-analysis"],
  "covid-19-herd-immunity-study": ["forecasting"],
  "sentiboard-paper": ["sentiment-analysis"],
  "sentiboard-bsc-thesis": ["sentiment-analysis"],
  "indobert-university-reviews-model": ["sentiment-analysis"],
  "indobertweet-review-sentiment-model": ["sentiment-analysis"],
  "indobert-review-sentiment-model": ["sentiment-analysis"],
  "microsoft-ai-client-workshop": ["ai-agents", "teaching"],
  "agent-framework-walkthrough": ["ai-agents", "teaching"],
  "basic-ai-study-groups": ["teaching"],
  "go-programming-practicum": ["teaching"],
  "programming-club-workshops": ["teaching"],
  "hackathon-judge-2022": ["teaching"],
};

/** Items allowed without a topic (post slugs or item ids; none today). */
export const TOPIC_UNMAPPED: ReadonlySet<string> = new Set<string>();
