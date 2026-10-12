import type { AskLocale, AskOutcome, AskSource, AskTag } from "../../src/ask/protocol";
import { checkAnswer, closestSource, type CheckFailure } from "./checks";
import { isHarmful } from "./harmful";
import { indexPack } from "./pack-index";
import { canned, noViewMessage, type CannedKind } from "./messages";
import { DEFAULT_FALLBACK, DEFAULT_PRIMARY, generate, type AttemptFailure, type ModelClient, type Timeouts } from "./model";
import { buildMessages } from "./prompt";
import { retrieve } from "./retrieve";
import { isPerspectiveQuestion, opinionAboutOthers, privateTopic } from "./scope";
import { answerTags } from "./tags";
import type { KnowledgePack, SafetyData } from "./types";

/**
 * Retrieval, generation and output checks (spec 7.4 steps 7 and 8) for one cleaned, PII-scrubbed
 * question. Shared by the Pages Function and the nightly eval (scripts/ask-eval.ts), so both run
 * exactly the same pipeline.
 */

export interface PipelineInput {
  question: string;
  locale: AskLocale;
  pack: KnowledgePack;
  vocabulary: ReadonlySet<string>;
  safety: SafetyData;
  client: ModelClient;
  models?: { primary: string; fallback?: string };
  timeouts?: Timeouts;
}

export type PipelineReason = CheckFailure | "harmful" | "private" | "others" | "model_failed";

export interface PipelineResult {
  text: string;
  outcome: AskOutcome;
  source: AskSource;
  /** Set when the model's text was not shown (harmful input, model failure or a failed output check). */
  reason?: PipelineReason;
  detail?: string[];
  /** Raw model text before the checks (eval reports only; never sent to the browser). */
  raw?: string;
  failures: { model: string; reason: AttemptFailure }[];
  calledModel: boolean;
  chunkIds: string[];
  /** Allowlisted topic tags of the retrieved chunks (follow-up pills); empty when nothing was retrieved. */
  tags: AskTag[];
  /** Page View path of the written source the answer cites, or of the closest one for the no-view answer (`isAskCite`). */
  cite?: string;
}

const OUTCOME_OF: Record<CannedKind, AskOutcome> = {
  unknown: "unknown",
  decline: "decline",
  restricted: "decline",
  fallback: "fallback",
  private: "decline",
  others: "decline",
  noView: "unknown",
};

/** Lowercase vocabulary of the pack (entity check). */
export function packVocabulary(pack: KnowledgePack): ReadonlySet<string> {
  return indexPack(pack).vocabulary;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { question, locale, pack, vocabulary, safety, client } = input;
  // Deterministic declines first (T15 and spec section 13): no retrieval, no model call, never cached.
  const early = (kind: CannedKind, reason: PipelineReason): PipelineResult => ({
    text: canned(kind, locale),
    outcome: OUTCOME_OF[kind],
    source: "none",
    reason,
    failures: [],
    calledModel: false,
    chunkIds: [],
    tags: [],
  });
  if (isHarmful(question)) return early("decline", "harmful");
  if (privateTopic(question)) return early("private", "private");
  if (opinionAboutOthers(question, pack.orgs, safety.blocklist)) return early("others", "others");

  const { chunks, context } = retrieve(pack, question, locale);
  const chunkIds = chunks.map((c) => c.id);
  const tags = answerTags(chunks);
  const messages = buildMessages(pack.packDate, context, question);
  const models = input.models ?? { primary: DEFAULT_PRIMARY, fallback: DEFAULT_FALLBACK };
  const generation = await generate(client, models, messages, input.timeouts);
  if (generation.source === "none") {
    return { text: canned("fallback", locale), outcome: "fallback", source: "none", reason: "model_failed", failures: generation.failures, calledModel: true, chunkIds, tags };
  }

  const check = checkAnswer({
    answer: generation.text,
    question,
    context,
    packDate: pack.packDate,
    pack,
    vocabulary,
    safety,
    chunks,
    perspective: isPerspectiveQuestion(question),
    locale,
  });
  if (!check.ok) {
    const closest = check.replacement === "noView" ? closestSource(chunks, locale) : undefined;
    return {
      text: check.replacement === "noView" ? noViewMessage(locale, closest) : canned(check.replacement, locale),
      outcome: OUTCOME_OF[check.replacement],
      source: "none",
      reason: check.reason,
      detail: check.detail,
      raw: generation.text,
      failures: generation.failures,
      calledModel: true,
      chunkIds,
      tags,
      ...(closest ? { cite: closest.url } : {}),
    };
  }
  return {
    text: check.text,
    outcome: check.outcome,
    source: generation.source,
    raw: generation.text,
    failures: generation.failures,
    calledModel: true,
    chunkIds,
    tags,
    ...(check.cite ? { cite: check.cite } : {}),
  };
}
