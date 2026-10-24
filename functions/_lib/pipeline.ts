import type { AskLocale, AskOutcome, AskSource, AskTag } from "../../src/ask/protocol";
import { checkAnswer, firstPersonVoice, relevantClosest, type CheckFailure } from "./checks";
import { isHarmful } from "./harmful";
import { indexPack } from "./pack-index";
import { canned, noViewMessage, PARTISAN_NOTE, partialDecline, type CannedKind } from "./messages";
import { normalizeDashes, SYNONYMS, tokenize } from "./text";
import { cosines, packVectors, ROUTER_LABELS, routerSignals, type Embedder, type RouterLabel } from "./vectors";
import { followUpAnchor, type HistoryTurn } from "./history";
import { DEFAULT_FALLBACK, DEFAULT_PRIMARY, generate, type BackupTier, type Generation, type ModelBreaker, type ModelClient, type Timeouts } from "./model";
import { buildMessages } from "./prompt";
import { INTENT_TERMS, leadMatches, retrieve, scoreChunks } from "./retrieve";
import { civicQuestion, isAdjacentQuestion, isCapabilityQuestion, isGeneralAssistantRequest, isLeadQuestion, isMentoringQuestion, isOffTopic, isPerspectiveQuestion, isPersonaRequest, isRuleOverride, isSiteQuestion, isTeamQuestion, opinionAboutOthers, partitionQuestion, privateTopic, nicknameForModel, resolveNickname, routedTopic, type PrivateTopic, type RoutedTopic } from "./scope";
import { answerTags } from "./tags";
import type { KnowledgePack } from "./types";

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
  /** Question embedder (Workers AI bge-m3, `bindingEmbedder`): hybrid retrieval when the pack has vectors; absent or failing keeps BM25. */
  embed?: Embedder;
}

export type PipelineReason = CheckFailure | "harmful" | "private" | "others" | "general" | "persona" | "injection" | "offtopic" | "model_failed" | "model_decline";

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
  /** Every cited page when the answer cites more than one (at most `ASK_MAX_CITES`, the first is `cite`). */
  cites?: string[];
  /** Route label (`AskRoute`, plus `+partial` for a mixed question): Analytics Engine blob14. Absent for canned replies. */
  route?: string;
  /** How the context was retrieved (blob15): `bm25` today; absent when nothing was retrieved. */
  retrieval?: "bm25" | "hybrid";
  /** A declined question that retrieval would have answered with a strong match (blob16, the over-refusal count). */
  strongMatch?: boolean;
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
  offtopic: "decline",
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
    return !isHarmful(q) && !privateTopic(q) && !opinionAboutOthers(q, pack.orgs, indexPack(pack).vocabulary) && !isGeneralAssistantRequest(q) && !isPersonaRequest(q) && !isRuleOverride(q) && !firstPersonVoice(t.a);
  });
}

/** Deterministic routes (owner decision 2026-10-24); `default` is the general retrieval route. Logged as Analytics Engine blob14. */
export type AskRoute = "lead" | "civic" | "policy" | "lifestyle" | "team" | "mentoring" | "adjacent" | "default";

/** Follow-up topics a canned decline offers (owner decision 2026-10-24: never a dead end). */
const REDIRECT_TAGS: Partial<Record<CannedKind, AskTag[]>> = {
  private: ["perspectives", "career", "work"],
  others: ["perspectives", "work"],
  decline: ["work", "ai", "perspectives"],
  offtopic: ["work", "ai", "career"],
};

/** Least BM25 score of a non-identity chunk, on the question's topic words, that marks a declined question as a likely over-refusal. */
export const STRONG_MATCH_SCORE = 8;
const IDENTITY = new Set(["profile", "now", "principles", "site-build"]);
/** Opinion and framing words: every perspective shares them, so they never show what a question is about. */
const MATCH_SKIP = new Set("think thinks thought view views opinion opinions feel feels like likes good bad best really honest honestly kurniadi pendapat pendapatnya pandangan pandangannya menurut suka".split(" "));

/**
 * A declined question that retrieval would have answered with a strong match (blob16, the weekly over-refusal count):
 * its topic words (opinion words, intent words and numbers aside) score at least `STRONG_MATCH_SCORE` on a chunk
 * other than the always-included ones.
 */
export function strongMatch(pack: KnowledgePack, question: string): boolean {
  const terms = tokenize(question).filter((t) => !/^\d+$/.test(t) && !MATCH_SKIP.has(t) && !INTENT_TERMS.has(t) && !INTENT_TERMS.has(SYNONYMS[t] ?? ""));
  if (!terms.length) return false;
  return scoreChunks(pack, terms.join(" ")).some((r) => !IDENTITY.has(r.chunk.id) && r.score >= STRONG_MATCH_SCORE);
}

/** The deterministic plan of one question: a canned reply, or a model route with its retrieval options. */
export type RoutePlan =
  | { kind: "canned"; canned: CannedKind; reason?: PipelineReason; tags: AskTag[]; lead?: boolean; strongMatch?: boolean }
  | {
      kind: "model";
      route: AskRoute;
      /** Question for routing, retrieval and the checks: his name for the nickname, the answerable part, plus a follow-up's anchor. */
      routed: string;
      /** The visitor's question as the model sees it (the answerable part of a mixed question). */
      modelQuestion: string;
      anchor?: string;
      history: HistoryTurn[];
      topic?: RoutedTopic;
      lead: boolean;
      adjacent: boolean;
      civic: boolean;
      mentoring: boolean;
      team: boolean;
      /** HARD private topics of a mixed question's declined clauses (`partitionQuestion`). */
      declined: PrivateTopic[];
    };

/**
 * Routing of one cleaned, PII-scrubbed question (owner rules 2026-10-15, 2026-10-19, 2026-10-24): harmful, persona
 * and rule overrides first, then general-assistant work, pay for a lead, HARD private topics (a mixed question keeps
 * its answerable clauses), opinions of named people, employers or clients, off-topic questions, then the answerable
 * routes. No retrieval of the answer and no model call happen here.
 */
export function planRoute(input: Pick<PipelineInput, "question" | "pack" | "history">): RoutePlan {
  const { pack } = input;
  // "ShinyQ" is Kurniadi's nickname (owner 2026-10-16): routing, retrieval and the checks see his name; the model also sees the visitor's word.
  let question = resolveNickname(input.question);
  let modelQuestion = nicknameForModel(input.question);
  const history = usableHistory(input.history ?? [], pack);
  // A short or referring follow-up ("What stack did it use?") is routed and retrieved together with the previous question.
  const anchor = followUpAnchor(input.question, history);
  const routedOf = (q: string) => (anchor ? resolveNickname(`${q} ${anchor}`) : q);
  let routed = routedOf(question);
  const either = <T>(check: (text: string) => T): T => {
    const own = check(question);
    return own || routed === question ? own : check(routed);
  };
  const canned = (kind: CannedKind, reason?: PipelineReason, extra: { lead?: boolean; tags?: AskTag[]; match?: boolean } = {}): RoutePlan => ({
    kind: "canned",
    canned: kind,
    ...(reason ? { reason } : {}),
    tags: extra.tags ?? REDIRECT_TAGS[kind] ?? [],
    ...(extra.lead ? { lead: true } : {}),
    ...(extra.match ? { strongMatch: strongMatch(pack, question) } : {}),
  });
  if (either(isHarmful)) return canned("decline", "harmful", { tags: [] });
  if (isCapabilityQuestion(question)) return canned("capabilities", undefined, { tags: CAPABILITY_TAGS });
  // Rover answers as itself (owner decision 2026-10-19): persona switches and rule overrides never reach the model.
  if (either(isPersonaRequest)) return canned("persona", "persona", { tags: [] });
  if (either(isRuleOverride)) return canned("decline", "injection", { tags: [] });
  // An earlier project inquiry never turns a request for general-assistant work into a lead.
  if (!isLeadQuestion(question) && isGeneralAssistantRequest(question)) return canned("decline", "general", { match: true });
  const lead = either(isLeadQuestion);
  const personal = either(privateTopic);
  // A project inquiry that asks for a price gets no number, but still the invitation and the contact card.
  if (personal === "pay" && lead) return canned("leadRates", undefined, { tags: ["contact"], lead: true });
  let declined: PrivateTopic[] = [];
  if (personal) {
    // A mixed question (owner decision 2026-10-24) keeps its answerable clauses; nothing answerable left: declined.
    const index = indexPack(pack);
    const part = partitionQuestion(question, (t) => index.df.has(t));
    if (!part.answerable || part.answerable === question) return canned("private", "private", { match: true });
    declined = part.declined;
    question = part.answerable;
    modelQuestion = part.answerable;
    routed = routedOf(question);
  }
  const vocabulary = indexPack(pack).vocabulary;
  if (either((q) => opinionAboutOthers(q, pack.orgs, vocabulary))) return canned("others", "others", { match: true });
  if (!lead && either(isGeneralAssistantRequest)) return canned("decline", "general", { match: true });
  // Weather, trivia, arithmetic and the like (owner decision 2026-10-24): a fixed redirect, no model call.
  if (!lead && !declined.length && isOffTopic(question)) return canned("offtopic", "offtopic", { match: true });

  // A learning question wins over the AI-and-jobs policy heuristic ("Which certificates would help me land an AI job?").
  const mentoring = !lead && !civicQuestion(routed) && isMentoringQuestion(routed);
  const topic = lead || mentoring ? undefined : routedTopic(routed);
  const civic = !lead && topic === "policy" && (civicQuestion(routed) || declined.includes("politics"));
  const team = !lead && !topic && !mentoring && isTeamQuestion(routed);
  // A related professional question (owner decision 2026-10-19): answered only from his work, with a cited source.
  const adjacent = !lead && !topic && !mentoring && !team && isAdjacentQuestion(routed);
  const route: AskRoute = lead ? "lead" : civic ? "civic" : topic ? topic : mentoring ? "mentoring" : team ? "team" : adjacent ? "adjacent" : "default";
  return { kind: "model", route, routed, modelQuestion, ...(anchor ? { anchor } : {}), history, ...(topic ? { topic } : {}), lead, adjacent, civic, mentoring, team, declined };
}

/**
 * Semantic router assist (owner decision 2026-10-24, thresholds from the 2026-10-24 probe): the question's similarity to
 * the router exemplars only re-routes a question the rules left on the default route, to learning, civic or off-topic,
 * when one label clearly leads. It never declines a private topic and never answers one: a strong private similarity
 * blocks every re-route, and the HARD rules ran before.
 */
export const ASSIST = { mentoring: 0.8, civic: 0.85, offtopic: 0.6, margin: 0.1, offtopicMargin: 0.15, privateVeto: 0.85, offtopicChunkMax: 0.5 } as const;

export function assistRoute(plan: Extract<RoutePlan, { kind: "model" }>, signals: Partial<Record<RouterLabel, number>>, bestChunk: number): AskRoute | "offtopic" | undefined {
  if (plan.route !== "default" || plan.declined.length || plan.anchor) return undefined;
  const s = (label: RouterLabel) => signals[label] ?? 0;
  if (s("private") >= ASSIST.privateVeto) return undefined;
  const others = (label: RouterLabel) => Math.max(...ROUTER_LABELS.filter((l) => l !== label).map(s));
  if (s("mentoring") >= ASSIST.mentoring && s("mentoring") - others("mentoring") >= ASSIST.margin) return "mentoring";
  if (s("civic") >= ASSIST.civic && s("civic") - others("civic") >= ASSIST.margin) return "civic";
  if (s("offtopic") >= ASSIST.offtopic && s("offtopic") - others("offtopic") >= ASSIST.offtopicMargin && bestChunk < ASSIST.offtopicChunkMax) return "offtopic";
  return undefined;
}

/** The partisan note of a civic answer, then the line for a mixed question's declined clauses (never both for politics). */
function withNotes(text: string, plan: Extract<RoutePlan, { kind: "model" }>, locale: AskLocale): string {
  const notes: string[] = [];
  if (plan.civic) notes.push(PARTISAN_NOTE[locale]);
  const declined = plan.civic ? plan.declined.filter((t) => t !== "politics") : plan.declined;
  if (declined.length) notes.push(partialDecline(declined, locale));
  return notes.length ? `${text}\n\n${notes.join(" ")}` : text;
}

export async function runPipeline(input: PipelineInput): Promise<PipelineResult> {
  const { locale, pack, vocabulary, client } = input;
  let plan = planRoute(input);
  // One embedding call for a question that reaches retrieval (owner decision 2026-10-24); a failure keeps BM25.
  const vectors = plan.kind === "model" && input.embed ? packVectors(pack) : null;
  const semantic = vectors && plan.kind === "model" && input.embed ? await input.embed(plan.routed) : null;
  if (semantic && vectors && plan.kind === "model") {
    const best = Math.max(0, ...cosines(semantic, vectors.rows, vectors.norms, vectors.dims));
    const assisted = assistRoute(plan, routerSignals(semantic, vectors), best);
    if (assisted === "offtopic") plan = { kind: "canned", canned: "offtopic", reason: "offtopic", tags: REDIRECT_TAGS.offtopic ?? [] };
    else if (assisted === "mentoring") plan = { ...plan, route: "mentoring" as const, mentoring: true };
    else if (assisted === "civic") plan = { ...plan, route: "civic" as const, civic: true, topic: "policy" as const };
  }
  // Deterministic routing first (T15, spec section 13, owner rules 2026-10-15): no retrieval, no model call, never cached.
  if (plan.kind === "canned") {
    return {
      text: canned(plan.canned, locale),
      outcome: OUTCOME_OF[plan.canned],
      source: "none",
      ...(plan.reason ? { reason: plan.reason } : {}),
      failures: [],
      calledModel: false,
      chunkIds: [],
      tags: plan.tags,
      ...(plan.lead ? { lead: true } : {}),
      ...(plan.strongMatch ? { strongMatch: true } : {}),
      historyUsed: 0,
    };
  }
  const { routed, topic, lead, adjacent, civic, mentoring, team, anchor, history } = plan;
  const routeLabel = `${plan.route}${plan.declined.length ? "+partial" : ""}`;
  const { chunks, context } = retrieve(pack, routed, locale, { topic, lead, adjacent, civic, mentoring, team, ...(anchor ? { anchor: resolveNickname(anchor) } : {}), ...(semantic ? { semantic } : {}) });
  const chunkIds = chunks.map((c) => c.id);
  const tags = answerTags(chunks);
  const matches = lead ? leadMatches(pack, routed) : [];
  const routing = { ...(topic ? { topic } : {}), ...(adjacent ? { adjacent } : {}), ...(civic ? { civic } : {}), ...(mentoring ? { mentoring } : {}), ...(team ? { team } : {}), ...(lead ? { lead: { matches: matches.map((c) => c.title) } } : {}) };
  const messages = buildMessages(pack.packDate, context, plan.modelQuestion, routing, history);
  const historyUsed = history.length;
  const models = input.models ?? { primary: DEFAULT_PRIMARY, fallback: DEFAULT_FALLBACK };
  const generation = await generate(client, models, messages, input.timeouts, { backups: input.backups, breaker: input.breaker, locale, ...(input.deadlineMs !== undefined ? { deadlineMs: input.deadlineMs } : {}) });
  const leadFlag = lead ? { lead: true } : {};
  const modelOf = generation.model ? { model: generation.model } : {};
  const common = { route: routeLabel, retrieval: semantic ? ("hybrid" as const) : ("bm25" as const) };
  if (generation.source === "none") {
    if (lead) return { text: canned("lead", locale), outcome: "answer", source: "none", reason: "model_failed", failures: generation.failures, calledModel: true, chunkIds, tags, lead: true, historyUsed, ...common };
    return { text: canned("fallback", locale), outcome: "fallback", source: "none", reason: "model_failed", failures: generation.failures, calledModel: true, chunkIds, tags, historyUsed, ...common };
  }

  const check = checkAnswer({
    answer: normalizeDashes(generation.text),
    question: routed,
    context,
    packDate: pack.packDate,
    pack,
    vocabulary,
    chunks,
    perspective: !lead && isPerspectiveQuestion(routed),
    site: !lead && isSiteQuestion(routed),
    ...(topic ? { topic } : {}),
    ...(lead ? { lead: { fit: matches.length > 0 } } : {}),
    adjacent,
    mentoring,
    locale,
  });
  if (!check.ok) {
    // A project inquiry whose answer cannot be shown still gets the invitation and the card; safety replacements stay.
    const replacement: CannedKind = lead && check.replacement !== "restricted" ? "lead" : check.replacement;
    const closest = replacement === "noView" ? relevantClosest(pack, routed, chunks, locale, { adjacent: adjacent || mentoring }) : undefined;
    const base = replacement === "noView" ? noViewMessage(locale, closest) : canned(replacement, locale);
    // An honest "no written view" still carries the civic note and the mixed question's line; safety replacements never do.
    const text = replacement === "noView" || replacement === "unknown" ? withNotes(base, plan, locale) : base;
    return {
      text,
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
      ...common,
    };
  }
  // An adjacent or learning question the model declines or cannot answer from CONTEXT gets the no-view reply naming his closest work.
  if ((adjacent || mentoring) && (check.outcome === "decline" || check.outcome === "unknown")) {
    const closest = relevantClosest(pack, routed, chunks, locale, { adjacent: true });
    return { text: withNotes(noViewMessage(locale, closest), plan, locale), outcome: "unknown", source: "none", reason: "unsourced", raw: generation.text, failures: generation.failures, ...modelOf, calledModel: true, chunkIds, tags, ...(closest ? { cite: closest.url } : {}), historyUsed, ...common };
  }
  // The model's own refusal is replaced by the fixed one, which points back to what this assistant covers.
  // A project inquiry the model refuses or cannot place (no matching work) still gets the invitation and the card.
  if (check.outcome === "decline" || (lead && check.outcome === "unknown")) {
    const kind: CannedKind = lead ? "lead" : "decline";
    return { text: canned(kind, locale), outcome: OUTCOME_OF[kind], source: "none", reason: "model_decline", raw: generation.text, failures: generation.failures, ...modelOf, calledModel: true, chunkIds, tags: lead ? tags : (REDIRECT_TAGS.decline ?? []), ...leadFlag, historyUsed, ...common };
  }
  return {
    text: withNotes(check.text, plan, locale),
    outcome: check.outcome,
    source: generation.source,
    raw: generation.text,
    failures: generation.failures,
    ...modelOf,
    calledModel: true,
    chunkIds,
    tags,
    ...(check.cite ? { cite: check.cite } : {}),
    ...(check.cites && check.cites.length > 1 ? { cites: check.cites } : {}),
    ...leadFlag,
    historyUsed,
    ...common,
  };
}
