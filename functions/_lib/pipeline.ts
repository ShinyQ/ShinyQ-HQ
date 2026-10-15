import type { AskLocale, AskOutcome, AskSource, AskTag } from "../../src/ask/protocol";
import { checkAnswer, closestSource, type CheckFailure } from "./checks";
import { isHarmful } from "./harmful";
import { indexPack } from "./pack-index";
import { canned, noViewMessage, type CannedKind } from "./messages";
import { DEFAULT_FALLBACK, DEFAULT_PRIMARY, generate, type AttemptFailure, type ModelClient, type Timeouts } from "./model";
import { buildMessages } from "./prompt";
import { leadMatches, retrieve } from "./retrieve";
import { isCapabilityQuestion, isGeneralAssistantRequest, isLeadQuestion, isPerspectiveQuestion, isSiteQuestion, opinionAboutOthers, privateTopic, routedTopic } from "./scope";
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

export type PipelineReason = CheckFailure | "harmful" | "private" | "others" | "general" | "model_failed" | "model_decline";

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
  /** Page View path of the written source the answer cites (or the public repository for a site question), or of the closest one for the no-view answer (`isAskCite`). */
  cite?: string;
  /** Lead intent (owner request 2026-10-15): the `done` frame carries the contact card (`pack.contact`). */
  lead?: boolean;
}

const OUTCOME_OF: Record<CannedKind, AskOutcome> = {
  unknown: "unknown",
  decline: "decline",
  restricted: "decline",
  fallback: "fallback",
  private: "decline",
  others: "decline",
  noView: "unknown",
  capabilities: "answer",
  lead: "answer",
  leadRates: "answer",
};

/** Follow-up tags for the capabilities answer: one pill from each area it lists. */
const CAPABILITY_TAGS: AskTag[] = ["work", "career", "perspectives", "contact"];

/** Lowercase vocabulary of the pack (entity check). */
export function packVocabulary(pack: KnowledgePack): ReadonlySet<string> {
  return indexPack(pack).vocabulary;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { question, locale, pack, vocabulary, safety, client } = input;
  // Deterministic routing first (T15, spec section 13, owner rules 2026-10-15): no retrieval, no model call, never cached.
  const early = (kind: CannedKind, reason?: PipelineReason, extra: Partial<PipelineResult> = {}): PipelineResult => ({
    text: canned(kind, locale),
    outcome: OUTCOME_OF[kind],
    source: "none",
    ...(reason ? { reason } : {}),
    failures: [],
    calledModel: false,
    chunkIds: [],
    tags: [],
    ...extra,
  });
  if (isHarmful(question)) return early("decline", "harmful");
  if (isCapabilityQuestion(question)) return early("capabilities", undefined, { tags: CAPABILITY_TAGS });
  const lead = isLeadQuestion(question);
  const personal = privateTopic(question);
  // A project inquiry that asks for a price gets no number, but still the invitation and the contact card.
  if (personal === "pay" && lead) return early("leadRates", undefined, { tags: ["contact"], lead: true });
  if (personal) return early("private", "private");
  if (opinionAboutOthers(question, pack.orgs)) return early("others", "others");
  if (!lead && isGeneralAssistantRequest(question)) return early("decline", "general");

  const topic = lead ? undefined : routedTopic(question);
  const { chunks, context } = retrieve(pack, question, locale, { topic, lead });
  const chunkIds = chunks.map((c) => c.id);
  const tags = answerTags(chunks);
  const matches = lead ? leadMatches(pack, question) : [];
  const messages = buildMessages(pack.packDate, context, question, { ...(topic ? { topic } : {}), ...(lead ? { lead: { matches: matches.map((c) => c.title) } } : {}) });
  const models = input.models ?? { primary: DEFAULT_PRIMARY, fallback: DEFAULT_FALLBACK };
  const generation = await generate(client, models, messages, input.timeouts);
  const leadFlag = lead ? { lead: true } : {};
  if (generation.source === "none") {
    if (lead) return { text: canned("lead", locale), outcome: "answer", source: "none", reason: "model_failed", failures: generation.failures, calledModel: true, chunkIds, tags, lead: true };
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
    perspective: !lead && isPerspectiveQuestion(question),
    site: !lead && isSiteQuestion(question),
    ...(topic ? { topic } : {}),
    ...(lead ? { lead: { fit: matches.length > 0 } } : {}),
    locale,
  });
  if (!check.ok) {
    // A project inquiry whose answer cannot be shown still gets the invitation and the card; safety replacements stay.
    const replacement: CannedKind = lead && check.replacement !== "restricted" ? "lead" : check.replacement;
    const closest = replacement === "noView" ? closestSource(chunks, locale) : undefined;
    return {
      text: replacement === "noView" ? noViewMessage(locale, closest) : canned(replacement, locale),
      outcome: OUTCOME_OF[replacement],
      source: "none",
      reason: check.reason,
      detail: check.detail,
      raw: generation.text,
      failures: generation.failures,
      calledModel: true,
      chunkIds,
      tags,
      ...(closest ? { cite: closest.url } : {}),
      ...leadFlag,
    };
  }
  // The model's own refusal is replaced by the fixed one, which points back to what this assistant covers.
  // A project inquiry the model refuses or cannot place (no matching work) still gets the invitation and the card.
  if (check.outcome === "decline" || (lead && check.outcome === "unknown")) {
    const kind: CannedKind = lead ? "lead" : "decline";
    return { text: canned(kind, locale), outcome: OUTCOME_OF[kind], source: "none", reason: "model_decline", raw: generation.text, failures: generation.failures, calledModel: true, chunkIds, tags: lead ? tags : [], ...leadFlag };
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
    ...leadFlag,
  };
}
