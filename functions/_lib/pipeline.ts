import type { AskLocale, AskOutcome, AskSource } from "../../src/ask/protocol";
import { checkAnswer, type CheckFailure } from "./checks";
import { isHarmful } from "./harmful";
import { indexPack } from "./pack-index";
import { canned, type CannedKind } from "./messages";
import { DEFAULT_FALLBACK, DEFAULT_PRIMARY, generate, type AttemptFailure, type ModelClient, type Timeouts } from "./model";
import { buildMessages } from "./prompt";
import { retrieve } from "./retrieve";
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

export type PipelineReason = CheckFailure | "harmful" | "model_failed";

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
}

const OUTCOME_OF: Record<CannedKind, AskOutcome> = { unknown: "unknown", decline: "decline", restricted: "decline", fallback: "fallback" };

/** Lowercase vocabulary of the pack (entity check). */
export function packVocabulary(pack: KnowledgePack): ReadonlySet<string> {
  return indexPack(pack).vocabulary;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { question, locale, pack, vocabulary, safety, client } = input;
  if (isHarmful(question)) {
    return { text: canned("decline", locale), outcome: "decline", source: "none", reason: "harmful", failures: [], calledModel: false, chunkIds: [] };
  }

  const { chunks, context } = retrieve(pack, question, locale);
  const chunkIds = chunks.map((c) => c.id);
  const messages = buildMessages(pack.packDate, context, question);
  const models = input.models ?? { primary: DEFAULT_PRIMARY, fallback: DEFAULT_FALLBACK };
  const generation = await generate(client, models, messages, input.timeouts);
  if (generation.source === "none") {
    return { text: canned("fallback", locale), outcome: "fallback", source: "none", reason: "model_failed", failures: generation.failures, calledModel: true, chunkIds };
  }

  const check = checkAnswer({ answer: generation.text, question, context, packDate: pack.packDate, pack, vocabulary, safety });
  if (!check.ok) {
    return {
      text: canned(check.replacement, locale),
      outcome: OUTCOME_OF[check.replacement],
      source: "none",
      reason: check.reason,
      detail: check.detail,
      raw: generation.text,
      failures: generation.failures,
      calledModel: true,
      chunkIds,
    };
  }
  return { text: check.text, outcome: check.outcome, source: generation.source, raw: generation.text, failures: generation.failures, calledModel: true, chunkIds };
}
