# Bring Your Problem: Rover's Approach Mode (design)

Status: in review (spec only; the plan is written when implementation is released).

Owner decision 2026-10-25 (decision file `docs/decisions/2026-10-25-ask-bring-your-problem.md`, added with the
implementation). Sub-project E of the owner's brainstorm.

## 1. Problem

A recruiter or a potential client who brings a concrete problem to Rover ("Our support team drowns in tickets, how
would he tackle it?") gets either a default answer or, when the question reads as a lead, the short lead answer:
related skills, matching project titles, availability and a contact card. Kurniadi's way of working stays abstract. The
site already holds the material to make it tangible: each project's problem, lead approach step, outcome and stack,
his principles and his written perspectives.

The 2026-10-15 lead rule blocks a fuller answer: "project or hiring questions get matching projects and a contact card,
never estimates, designs, code or requests for personal data". Today rule 11 caps a lead answer at 4 sentences and the
`consulting` guard (`functions/_lib/checks.ts`) rejects visitor-directed advice, durations, cost words and any answer
over 5 sentences.

## 2. Owner decisions (approved 2026-10-25)

- Relax the lead rule for one case: an **approach outline grounded in his past projects and written views** (how he
  tackled similar problems). Still never estimates, prices, timelines, code, system designs for the visitor, stack or
  architecture picks for the visitor, or requests for personal data.
- Discovery stays **inside Rover**: curated problem pills in the dock plus detection from free text. No new string in
  the `ask` messages namespace (it is inlined on every page; `/en/quick` has 35 B of HTML headroom).
- Only a visitor who **describes a problem or asks how he would approach one** gets the outline. Plain hiring questions
  ("Can he build us a chatbot?") keep today's short lead answer.
- **No matching project** (`leadMatches` empty): fall back to today's lead answer (related skills, availability,
  contact card, no approach).
- Framing is **past tense and grounded**: "In <project>, he started by ...", "His written view on X is ...", then at
  most one bridging sentence ("a similar problem would likely start the same way"). Never "he would build you ...".
- Approach **A**: a new `approach` mode inside the lead route, with its own routing line, a narrower guard, a
  groundedness floor and a required project cite. Rejected: B, a prompt-only relaxation of rule 11 with a looser guard
  for every lead; C, a deterministic server-side composer with fixed EN/ID templates.
- **The knowledge pack does not change.** Project chunks keep what they hold today (problem, lead approach step,
  outcome, stack; hero projects keep every step). The text pack and the stored value (about 731 of 768 KiB) stay put.

## 3. Behavior

### 3.1 Detection

`isProblemQuestion(question)` in `functions/_lib/scope.ts`, deterministic, EN and ID, two shapes:

1. **Own problem** (as built: no first person singular and 40 characters, see section 10, refinement 5): a visitor
   subject ("we", "our team", "our company", "my company", "I", "kami", "tim kami", "perusahaan kami", "saya",
   "usaha kami") within about 30 characters of a problem word ("struggle", "problem",
   "issue", "bottleneck", "pain point", "drowning in", "too slow", "manual", "can't keep up", "keeps failing",
   "kesulitan", "masalah", "kewalahan", "kendala", "lambat", "sering gagal").
2. **Approach ask**: "how would (he | Kurniadi | you) (approach | tackle | solve | handle | go about | start)", "what
   would (he | Kurniadi) do about", "bagaimana (dia | Kurniadi) (akan )?(menangani | menyelesaikan | mendekati |
   memulai)", "kalau Kurniadi yang menangani". As built, the Indonesian ask needs "akan" (section 10,
   refinement 10).

Negatives (unit tested): a question about his own work ("How did he build the fraud review?"), a tutorial ("How do I
build a RAG chatbot step by step?"), a definition, a site question, a plain hiring question, and civic or private
questions (their rules run first). The visitor's text stays untrusted data.

### 3.2 Routing (`planRoute` in `functions/_lib/pipeline.ts`)

- A problem question counts as a lead: `lead = either(isLeadQuestion) || either(isProblemQuestion)` (the question, or
  the question plus its follow-up anchor). Every earlier step is unchanged: harmful, persona and override declines, a
  rate request (`MESSAGES.leadRates`), HARD private topics and `partitionQuestion` for a mixed question.
- `approach = lead && either(isProblemQuestion) && leadMatches(pack, routed).length > 0` (then at most 2 matches and
  the demotion to `lead` when none is left: section 10, refinement 1).
- Route: `approach` when `approach` is true; otherwise `lead` as today (a plain hiring question, or a problem with no
  matching project). `AskRoute` gains `"approach"`.
- A problem question that also asks for code or a full design is still a lead (except general-assistant work: section
  10, refinement 2): the prompt and the output checks
  (`containsCode`, `prescribes`) keep it from becoming free work, as for today's leads.

### 3.3 The answer

- Past tense, by project title: what the project faced and how he started on it, only with steps CONTEXT states.
- At most one of his written views that applies, with its source tag (rule 17).
- At most one bridging sentence that a similar problem would likely start the same way.
- Ends with the invitation to get in touch; the dock shows the contact card.
- At most 6 sentences or 4 list items, plus the invitation.
- The `done` frame carries `contact` (as for every lead) and `cite`/`cites`: the first cited matched project page
  (`/labs/<slug>`), plus a cited post when there is one (`ASK_MAX_CITES` 2, one per kind).

## 4. Components

### 4.1 Retrieval (`retrieve` in `functions/_lib/retrieve.ts`)

- New `approach` option. The lead set comes first, unchanged: `ALWAYS_INCLUDE`, `LEAD_INCLUDE`, `LEAD_ENGAGEMENTS`,
  then `leadMatches` (1 to 3; as built, the approach route keeps at most 2: section 10, refinement 1).
- Then `principles` and at most `APPROACH_PERSPECTIVE_CAP` (2) perspectives, ranked by the hybrid `scoreChunks` on the
  question (bge-m3 plus BM25, BM25 alone on embedding failure). They come after the matches so the context budget
  never clips a match.
- Context budget unchanged (6,000 characters). `leadMatches` stays BM25, as today (the approach route then orders its
  matches by cosine: section 10, refinement 1).

### 4.2 Prompt (`functions/_lib/prompt.ts`)

- Rule 11 gains one clause: "... unless the routing marks an approach question (rule 18)".
- New rule 18: when the routing marks an approach question, describe how Kurniadi approached similar problems in the
  matching projects, in the past tense and by title, using only steps CONTEXT states, plus at most one of his written
  views that applies (tagged); at most one sentence that a similar problem would likely start the same way; at most 6
  sentences or 4 list items; never tell the visitor what to use or build, recommend a stack or an architecture,
  estimate cost, price or timeline, write code or ask for their data; end with the invitation to get in touch.
- New routing line `APPROACH_LINE` naming the matched titles (replaces the lead line for this route; built as the
  function `approachLine(titles)`).
- Bump `PROMPT_VERSION` (`2026-10-25.approach.1`). Adding a rule changes the stable system prompt prefix once (the Groq
  prompt cache rewarms).

### 4.3 Output checks (`checkAnswer` in `functions/_lib/checks.ts`)

New input `approach?: { matches: KnowledgeChunk[] }` (implies `lead` with `fit: true`). In approach mode:

1. `prescribes` replaces `consulting` (as built, durations stated in CONTEXT pass and it runs before the voice check:
   section 10, refinement 6): it keeps every `CONSULTING` pattern (durations, cost and estimate words,
   visitor-directed advice such as "you should use", "I recommend", "recommended stack", "the architecture would",
   "step 1", "first, set up", "sebaiknya anda gunakan", "arsitekturnya akan") and replaces the 5-sentence cap with 7
   sentences and at most 4 list items. Failure: reason `consulting`, replacement `lead`.
2. Groundedness: the adjacent floor (`ADJACENT_MIN_GROUNDED`, 65% of the answer's own words in CONTEXT) and the
   `GENERALITY` wording check. Failure: reason `unsourced`, replacement `lead`.
3. A matched project cited by title: `citedSources` limited to `approach.matches` (plus `markedSources` tags on them).
   None: reason `unsourced`, replacement `lead`.
4. An opinion claim must cite his written view (rule 8, `SOURCE_TYPES`), as for adjacent answers (never the
   engagements view: section 10, refinement 7).
5. Unchanged and still first: forbidden, secret, leak, `firstPersonVoice`, `containsCode`, `asksForPersonalData`,
   defamation, numeric, entity, employer and client-name checks.

Any failure, a model refusal or an empty answer becomes `MESSAGES.lead` with the contact card, never a looser answer.

### 4.4 Discovery (`content/ask/suggestions.json`)

- Four new `contact` pills, EN at most 48 characters, natural ID, each a problem that matches a real project, for
  example "Our fraud checks are manual. His approach?" and "How would he cut chatbot hallucinations?". Each sets
  `expect` (its matched project chunk and `contact`), `tags` and `followUps`. No client names (C3).
- Pills ship in the lazy AskChat chunk, so `/en/quick` is untouched. `src/lib/visits/labels.ts` renders chip labels on
  the stats page: check that page against the HTML budget.

### 4.5 Analytics

- Analytics Engine blob14 gains `approach` (plus `+partial`). `scripts/content-gap.ts` lists it in the Routes table.
  No new blob.

## 5. Data flow

```mermaid
flowchart LR
  Q[Question + anchor] --> D{declines / rates / HARD}
  D -->|declined| C1[canned]
  D --> L{lead or problem?}
  L -->|no| O[other routes]
  L -->|problem + leadMatches| A[route approach]
  L -->|else| LD[route lead, today]
  A --> R[retrieve: lead set + principles + 2 perspectives]
  R --> M[model chain, rule 18 + APPROACH_LINE]
  M --> K{checkAnswer approach}
  K -->|ok| OUT[answer + cite + contact card]
  K -->|fail| ML[MESSAGES.lead + contact card]
```

## 6. Cache, memory and cost

- Cache and memory unchanged: first turns read and write the KV cache; follow-ups skip it. The PII scrub runs before
  the cache key, as today.
- Cost per answer stays about 36 to 40 neurons: the context budget and the output cap do not change.

## 7. Testing and evals

Free (Vitest, no network):

- `tests/ask/scope.test.ts`: `isProblemQuestion` positives and negatives in EN and ID (section 3.1).
- `tests/ask/routing-matrix.test.ts`: approach; problem with no match (lead); plain hiring (lead); problem plus a HARD
  clause (approach plus partial decline); problem plus a code request (approach, code check).
- `tests/ask/checks.test.ts`: `prescribes` (a past-tense outline passes; "you should use", a timeline, a stack pick and
  8 sentences fail), the cite requirement, the groundedness floor.
- `tests/ask/pipeline.test.ts` and `tests/ask/handler.test.ts`: cite, contact card, fallback reasons, blob14.
- `tests/ask/suggestions.test.ts` covers the new pills (EN and ID retrieve their `expect` chunks).

Model evals (Workers AI neurons; one run about 27 calls, about 1,100 neurons, 11% of the free daily allocation):

- Golden q97 to q102: per language, two approach items (expect a project title, a past-tense verb, an invitation;
  `none`: durations, "you should", "sebaiknya gunakan") and one no-match fallback. q97 joins `SMOKE_GOLDEN`.
- Red-team rt75 to rt79: a problem that asks for an architecture, a timeline, code, an instruction hidden in a problem
  description, and a client-name lure.
- Boundary: 2 approach items (16 of `BOUNDARY_MAX_CALLS` 20).

## 8. Documentation

- Decision file `docs/decisions/2026-10-25-ask-bring-your-problem.md`: amends the 2026-10-15 lead rule (approach
  outline allowed for problem questions with matching projects; the bans stay).
- `docs/agents/ask.md`: a "Bring your problem" subsection under "Lead intent and the contact card", the scope table,
  the blob14 route list, rule 18.
- `docs/features.md` (Ask section and status log) and `docs/ask-runbook.md` (eval item lists).
- The site-build note stays untouched (it sits within 10 characters of its cap).

## 9. Out of scope

- Pack growth (more approach steps per project).
- Any new dock UI, mode toggle or Contact page entry.
- Prospective designs, estimates or proposals; follow-up turns that refine an outline into a plan.

## 10. Refinements during planning (2026-10-25)

Found while planning and building; where an earlier section differs, this section is what shipped.

1. Matches: the approach route keeps at most `APPROACH_MATCH_CAP` (2) of the `leadMatches`, ordered by cosine and
   dropped below `SEMANTIC_FLOOR` (0.45) when the question vector exists, in BM25 order otherwise
   (`approachMatches`). The 2026-10-25 bge-m3 probe showed weak third matches. None left: the route is demoted to
   `lead`, today's lead answer.
2. A problem question that asks for general-assistant work ("... write the code for us") stays declined as `general`:
   only `isLeadQuestion` bypasses that decline, so no new path reaches the model with a code request.
3. Problem detection never fires on a civic question or a routed lifestyle or policy topic, so "How would he solve
   corruption in the government?" keeps its civic route.
4. Known limitation: "support tickets" matches the event ticketing projects, lexically and semantically; no pill
   uses it.
5. Past-work guard: a question about his past work ("What problems did he solve at Metrodata?", "masalah apa yang
   pernah dia selesaikan", "the issues he fixed") is not a problem question unless a forward cue (an approach ask
   such as "how would he ..." or "his approach?", or the visitor's own problem with "like this" / "seperti ini") points
   back at the visitor's problem. A first person singular ("I struggle to learn ML") is a learning question, so the
   own-problem subjects are plural or a named team, company, startup, clinic or business, within 40 characters of
   the problem word.
6. `prescribes`: a duration passes only when CONTEXT states it (matched on word boundaries, so "3 weeks" never
   matches "13 weeks") and its sentence has no visitor or future framing ("you", "we", "within", "could", "will",
   "akan", "bisa"); the check runs before the first-person voice check, so "I recommend ..." in an approach answer is
   `consulting` (same `MESSAGES.lead` replacement). The forbidden, secret and leak checks still run first.
7. The freelance engagements perspective (`LEAD_ENGAGEMENTS`, always retrieved for a lead) never backs an opinion: the
   contact invitation echoes it.
8. The leak check ignores rule 18's bridging sentence ("A similar problem would likely start the same way.") and the
   contact-card invitation (`BENIGN` in `functions/_lib/checks.ts`).
9. A cache hit decides the contact card with `planRoute(...).lead` (only first-turn answers are cached and routing is
   deterministic), so cached problem answers keep the card.
10. The Indonesian approach ask needs "akan", as the English one needs "would": "Bagaimana dia menangani reliabilitas
    LLM?" asks about his practice (present tense) and keeps its route, while "Gimana dia akan mengatasi latensi voice
    AI?" is a problem question. A question with the visitor's own problem still matches through the own-problem shape.
11. Final review (2026-10-25), exclusions and lead promotion: problem detection also skips site, team, learning and
    views questions (`isPerspectiveQuestion` read without the approach ask itself), and a problem word must end on a
    word boundary ("issued", "problematic", "slowdown"). `isOwnProblem` and `isApproachAsk` split the two shapes: an
    own problem is always a lead; an approach ask is a lead only when `leadMatches` finds a past project, so "How
    would he handle a tight deadline?" keeps its default route and "... a disagreement with his manager?" its team
    route.
12. Final review, the lead opinion check: every lead answer that tells a view as his (`claimsOpinion`) must cite a
    written view, else `MESSAGES.lead` (reason `unsourced`). A plain lead may cite the engagements view (it restates
    his engagement terms); an approach answer may not (item 7).
13. Final review, stricter `prescribes` (approach only): a sentence that addresses the visitor ("you", "your",
    "kamu", "anda", "kalian") or starts with an imperative ("Start", "Use", "Build", "Add", "Pick", "Choose",
    "Consider", "Try", "Deploy", "Set up", "Mulai", "Gunakan", "Pakai", "Bangun", "Tambahkan", "Pilih", "Coba") fails;
    a sentence with "would", "will", "'ll", "might", "should", "akan", "sebaiknya" or "seharusnya" fails unless it is
    exactly the bridging sentence (a trailing source tag aside) or the word and the next two are his own words in
    CONTEXT or a retrieved written view; vague durations ("a few weeks", "beberapa minggu", "dalam hitungan hari")
    fail, and spelled-out durations ("six weeks", "dua minggu") are checked like digits (a case-study fact passes).
    Rule 18 states the exact bridging sentences: "A similar problem would likely start the same way." and, in
    Indonesian, "Masalah serupa kemungkinan besar dimulai dengan cara yang sama." (`APPROACH_BRIDGE`); the leak check
    ignores both.
14. Final review, the demotion: when the question vector drops every match, the plain lead states no match, its fit
    check treats it as no fit (a "strong fit" claim becomes `MESSAGES.lead`, reason `fit`), and retrieval runs with
    `excludeMatches`, so the rejected projects are neither offered nor retrieved.
