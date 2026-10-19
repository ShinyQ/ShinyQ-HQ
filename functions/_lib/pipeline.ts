import type { AskLocale, AskOutcome, AskSource, AskTag } from "../../src/ask/protocol";
import { checkAnswer, firstPersonVoice, relevantClosest, type CheckFailure } from "./checks";
import { isHarmful } from "./harmful";
import { indexPack } from "./pack-index";
import { canned, noViewMessage, type CannedKind } from "./messages";
import { normalizeDashes } from "./text";
import { followUpAnchor, type HistoryTurn } from "./history";
import { DEFAULT_FALLBACK, DEFAULT_PRIMARY, generate, type BackupTier, type Generation, type ModelBreaker, type ModelClient, type Timeouts } from "./model";
import { buildMessages } from "./prompt";
import { leadMatches, retrieve } from "./retrieve";
import { isAdjacentQuestion, isCapabilityQuestion, isGeneralAssistantRequest, isLeadQuestion, isPerspectiveQuestion, isPersonaRequest, isRuleOverride, isSiteQuestion, opinionAboutOthers, privateTopic, nicknameForModel, resolveNickname, routedTopic } from "./scope";
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
  /** Earlier turns the handler verified (signed by this server), oldest first. */
  history?: readonly HistoryTurn[];
  /** Tiers tried after Workers AI (the Groq models); empty or absent without a key. */
  backups?: BackupTier[];
  breaker?: ModelBreaker;
  /** Chain deadline override; absent keeps the production `CHAIN_MS`. The eval passes Infinity to keep its own timeouts. */
  deadlineMs?: number;
}

export type PipelineReason = CheckFailure | "harmful" | "private" | "others" | "general" | "persona" | "injection" | "model_failed" | "model_decline";

export interface PipelineResult {
  text: string;
  outcome: AskOutcome;
  source: AskSource;
  /** Set when the model's text was not shown (harmful input, model failure or a failed output check). */
  reason?: PipelineReason;
  detail?: string[];
  /** Raw model text before the checks (eval reports only; never sent to the browser). */
  raw?: string;
  failures: Generation["failures"];
  /** Model that produced the text, set whenever a model call succeeded (even if the checks then replaced its text). */
  model?: string;
  calledModel: boolean;
  chunkIds: string[];
  /** Allowlisted topic tags of the retrieved chunks (follow-up pills); empty when nothing was retrieved. */
  tags: AskTag[];
  /** Page View path of the written source the answer cites (`/build` for a site question), or of the closest one for the no-view answer (`isAskCite`). */
  cite?: string;
  /** Lead intent (owner request 2026-10-15): the `done` frame carries the contact card (`pack.contact`). */
  lead?: boolean;
  /** Earlier turns that reached the model (after `usableHistory`); 0 for a first turn or a canned answer. */
  historyUsed: number;
}

const OUTCOME_OF: Record<CannedKind, AskOutcome> = {
  unknown: "unknown",
  decline: "decline",
  restricted: "decline",
  fallback: "fallback",
  private: "decline",
  others: "decline",
  noView: "unknown",
  persona: "decline",
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

/**
 * Earlier turns whose question would itself be declined never reach the model (multi-turn memory,
 * owner decision 2026-10-17): a signed turn proves the server answered it, not that it was harmless.
 */
export function usableHistory(history: readonly HistoryTurn[], pack: KnowledgePack): HistoryTurn[] {
  return history.filter((t) => {
    const q = resolveNickname(t.q);
    // A signed answer that would now fail the voice check (an older or weaker check signed it) never becomes context.
    return !isHarmful(q) && !privateTopic(q) && !opinionAboutOthers(q, pack.orgs) && !isGeneralAssistantRequest(q) && !isPersonaRequest(q) && !isRuleOverride(q) && !firstPersonVoice(t.a);
  });
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { locale, pack, vocabulary, safety, client } = input;
  // "ShinyQ" is Kurniadi's nickname (owner 2026-10-16): routing, retrieval and the checks see his name; the model also sees the visitor's word.
  const question = resolveNickname(input.question);
  const modelQuestion = nicknameForModel(input.question);
  const history = usableHistory(input.history ?? [], pack);
  // A short or referring follow-up ("What stack did it use?") is routed and retrieved together with the previous question.
  const anchor = followUpAnchor(input.question, history);
  const routed = anchor ? resolveNickname(`${input.question} ${anchor}`) : question;
  const either = <T>(check: (text: string) => T): T => {
    const own = check(question);
    return own || routed === question ? own : check(routed);
  };
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
    historyUsed: 0,
    ...extra,
  });
  if (either(isHarmful)) return early("decline", "harmful");
  if (isCapabilityQuestion(question)) return early("capabilities", undefined, { tags: CAPABILITY_TAGS });
  // Rover answers as itself (owner decision 2026-10-19): persona switches and rule overrides never reach the model.
  if (either(isPersonaRequest)) return early("persona", "persona");
  if (either(isRuleOverride)) return early("decline", "injection");
  // An earlier project inquiry never turns a request for general-assistant work into a lead.
  if (!isLeadQuestion(question) && isGeneralAssistantRequest(question)) return early("decline", "general");
  const lead = either(isLeadQuestion);
  const personal = either(privateTopic);
  // A project inquiry that asks for a price gets no number, but still the invitation and the contact card.
  if (personal === "pay" && lead) return early("leadRates", undefined, { tags: ["contact"], lead: true });
  if (personal) return early("private", "private");
  if (either((q) => opinionAboutOthers(q, pack.orgs))) return early("others", "others");
  if (!lead && either(isGeneralAssistantRequest)) return early("decline", "general");

  const topic = lead ? undefined : routedTopic(routed);
  // A related professional question (owner decision 2026-10-19): answered only from his work, with a cited source.
  const adjacent = !lead && !topic && isAdjacentQuestion(routed);
  const { chunks, context } = retrieve(pack, routed, locale, { topic, lead, adjacent, ...(anchor ? { anchor: resolveNickname(anchor) } : {}) });
  const chunkIds = chunks.map((c) => c.id);
  const tags = answerTags(chunks);
  const matches = lead ? leadMatches(pack, routed) : [];
  const routing = { ...(topic ? { topic } : {}), ...(adjacent ? { adjacent } : {}), ...(lead ? { lead: { matches: matches.map((c) => c.title) } } : {}) };
  const messages = buildMessages(pack.packDate, context, modelQuestion, routing, history);
  const historyUsed = history.length;
  const models = input.models ?? { primary: DEFAULT_PRIMARY, fallback: DEFAULT_FALLBACK };
  const generation = await generate(client, models, messages, input.timeouts, { backups: input.backups, breaker: input.breaker, locale, ...(input.deadlineMs !== undefined ? { deadlineMs: input.deadlineMs } : {}) });
  const leadFlag = lead ? { lead: true } : {};
  const modelOf = generation.model ? { model: generation.model } : {};
  if (generation.source === "none") {
    if (lead) return { text: canned("lead", locale), outcome: "answer", source: "none", reason: "model_failed", failures: generation.failures, calledModel: true, chunkIds, tags, lead: true, historyUsed };
    return { text: canned("fallback", locale), outcome: "fallback", source: "none", reason: "model_failed", failures: generation.failures, calledModel: true, chunkIds, tags, historyUsed };
  }

  const check = checkAnswer({
    answer: normalizeDashes(generation.text),
    question: routed,
    context,
    packDate: pack.packDate,
    pack,
    vocabulary,
    safety,
    chunks,
    perspective: !lead && isPerspectiveQuestion(routed),
    site: !lead && isSiteQuestion(routed),
    ...(topic ? { topic } : {}),
    ...(lead ? { lead: { fit: matches.length > 0 } } : {}),
    adjacent,
    locale,
  });
  if (!check.ok) {
    // A project inquiry whose answer cannot be shown still gets the invitation and the card; safety replacements stay.
    const replacement: CannedKind = lead && check.replacement !== "restricted" ? "lead" : check.replacement;
    const closest = replacement === "noView" ? relevantClosest(pack, routed, chunks, locale, { adjacent }) : undefined;
    return {
      text: replacement === "noView" ? noViewMessage(locale, closest) : canned(replacement, locale),
      outcome: OUTCOME_OF[replacement],
      source: "none",
      reason: check.reason,
      detail: check.detail,
      raw: generation.text,
      failures: generation.failures,
      ...modelOf,
      calledModel: true,
      chunkIds,
      tags,
      ...(closest ? { cite: closest.url } : {}),
      ...leadFlag,
      historyUsed,
    };
  }
  // An adjacent question the model declines or cannot answer from CONTEXT gets the no-view reply naming his closest work.
  if (adjacent && (check.outcome === "decline" || check.outcome === "unknown")) {
    const closest = relevantClosest(pack, routed, chunks, locale, { adjacent: true });
    return { text: noViewMessage(locale, closest), outcome: "unknown", source: "none", reason: "unsourced", raw: generation.text, failures: generation.failures, ...modelOf, calledModel: true, chunkIds, tags, ...(closest ? { cite: closest.url } : {}), historyUsed };
  }
  // The model's own refusal is replaced by the fixed one, which points back to what this assistant covers.
  // A project inquiry the model refuses or cannot place (no matching work) still gets the invitation and the card.
  if (check.outcome === "decline" || (lead && check.outcome === "unknown")) {
    const kind: CannedKind = lead ? "lead" : "decline";
    return { text: canned(kind, locale), outcome: OUTCOME_OF[kind], source: "none", reason: "model_decline", raw: generation.text, failures: generation.failures, ...modelOf, calledModel: true, chunkIds, tags: lead ? tags : [], ...leadFlag, historyUsed };
  }
  return {
    text: check.text,
    outcome: check.outcome,
    source: generation.source,
    raw: generation.text,
    failures: generation.failures,
    ...modelOf,
    calledModel: true,
    chunkIds,
    tags,
    ...(check.cite ? { cite: check.cite } : {}),
    ...leadFlag,
    historyUsed,
  };
}
