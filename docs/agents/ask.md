# Ask the HQ

The Ask the HQ assistant: code, bindings, knowledge pack, chat dock, answer pipeline, scope rules, CSP, credentials and the CI around it.

Index: [AGENTS.md](../../AGENTS.md).

## Names

- Visible name (owner decision): the chat panel is **Ask Rover Assistant** (ID **Asisten Rover**) and answers are labelled "Rover"; the floating launcher stays **Ask AI**. The `>_` terminal is the Rover menu, a separate feature (see [hud-and-drawer.md](hud-and-drawer.md#rover-menu-name)).
- The internal name **Ask the HQ** stays in code, the Pages Function, workflows, scripts, the runbook and the design spec; so do `/api/ask` and the `hq:ask-*` keys.

## Design and operations

- Design: [`docs/superpowers/specs/2026-10-11-ask-hq-design.md`](../superpowers/specs/2026-10-11-ask-hq-design.md).
- Operations (provisioning, deploy, kill switch, rotation, incidents): [`docs/ask-runbook.md`](../ask-runbook.md).

## Code

- Function: `functions/api/ask.ts` and `functions/_lib/` (no new runtime dependencies, T12).
- Client and protocol: `src/ask/`.
- Pack builder: `scripts/build-knowledge.ts` (runs in `build` and `typecheck`), writing `functions/_generated/` (gitignored, never served).
- Answers are a safe markdown subset: paragraphs, lists, bold, italic, inline code, allowlisted links.
  - Parsed by `src/ask/markdown.ts`, rendered as React elements by `src/hud/ask/AskMarkdown.tsx` (never HTML).
  - Links allowlisted by `src/ask/links.ts`.
- Server side (`sanitizeAnswer`, `answerLinkPaths` in `functions/_lib/checks.ts`):
  - keeps only links to the retrieved chunks' pages (context lines carry `[link: <url>]`), the top pages (`ASK_LINK_PAGES`) and, for older cached answers, the public repository;
  - scans the markdown (URLs included) and its plain text for blocked terms, forbidden patterns and secrets;
  - runs every other check on `markdownToPlain`.

## Bindings, vars and secrets

All bindings and vars live in `wrangler.toml`.

| Name | Kind | Notes |
|---|---|---|
| `AI` | binding | |
| `ASK_KV` | binding | KV `shinyq-hq-ask` |
| `ASK_EVENTS` | binding | Analytics Engine `ask_events` |
| `PERF_EVENTS` | binding | Analytics Engine `perf_events`, the RUM beacon, kill switch `RUM_ENABLED` |
| `ASK_RL` | binding | optional |
| `ASK_ENABLED` | var | kill switch, anything but `"true"` is off |
| `ASK_PRIMARY`, `ASK_FALLBACK` | var | Workers AI models |
| `ASK_BACKUP_MODELS` | var | Groq backup models, comma list, in order; default `qwen/qwen3.8-27b,openai/gpt-oss-120b` |
| `ASK_GATEWAY_ID` | var | `shinyq-hq` |
| `TURNSTILE_SITE_KEY`, `ASK_ALLOWED_ORIGINS`, `ASK_DAILY_CAP` | var | |

- Secrets (`TURNSTILE_SECRET`, `ASK_IP_SALT_SEED`, `ASK_COOKIE_KEY`, and the optional `GROQ_API_KEY`) only via `wrangler pages secret put`, never in the repo.

## Deploy

- Deploy from the repo root so `functions/` is bundled: `bun run build`, then `bunx wrangler pages deploy out --project-name=kurniadi --branch=main`.

## Content release checklist

- When the owner changes jobs, earns a cert, ships a project or publishes a post, update in the same PR (the drift check fails otherwise):
  - `content/site-content.json` and `tests/ask/golden.json`;
  - `content/ask/site-build.json` when the site's own stack, hosting or gates change.
- Keep `content/ask/suggestions.json` true too (its retrieval test fails when a pill no longer finds its chunks).
- Live facts in the golden or red-team sets are `{{facts.<path>}}` placeholders (`src/ask/golden-facts.ts`), never literals.
- A new client of an employer goes into the blocklist first.

## Live facts

- `content/generated/dynamic-facts.json` is written only by `scripts/refresh-facts.ts` (weekly PR that `refresh-facts.yml` merges itself after dispatching CI on it).
- Numbers, dates, booleans and IDs only, never third-party text (T2); validate with `DynamicFactsSchema`.
- Stats listed in `DYNAMIC_STATS` (`src/content/load.ts`) take their value from it, so the stats ring, Page View and Ask agree.
- Read stats through `getStats()`, never `getContent().stats`.

## UI: the chat dock

- One shared chat dock (`src/hud/ask/`), mounted once in the locale layout outside `#site-shell`, so it works on every page and over the 3D tower.

### Entry points

- The floating "Ask AI" launcher: Page View, bottom-left, mirroring Back to 3D; it steps aside while the home hero bar reaches its bottom band.
- The "Ask AI" pill at the far right of the 3D top bar, right of the highlighted Classic site button (both on their own row below 1024 px).
- The home hero ask bar (`src/components/page/AskEntry.tsx`). About has no Ask section (owner decision).
- The Cmd-K "Ask:" row.
- `openAsk(q?, { topic?, source? })` (`hq:hud` command `{ type: "ask", q?, topic?, source? }`).
- A teaser shows once per session, and never while Rover's dialog box is up (see the Rover dialog section in [hud-and-drawer.md](hud-and-drawer.md)).

### Panel

- `AskChat`, a lazy chunk loaded on first open or hover/focus of an entry point.
- Layout (`drawerLayout`): a non-modal side panel on desktop and landscape tablets, a modal bottom sheet otherwise.
- Shows:
  - a thread (sessionStorage, last 20 messages); the last 3 signed turns go with each question (see [Multi-turn memory](#multi-turn-memory));
  - a **New chat** button in the header (`ask.dock.newChat`, ID "Obrolan baru") that clears the thread and the memory;
  - a "Try asking" row of 3 curated questions from 3 different topics, above the topic pills;
  - topic pills that expand into 4 curated questions;
  - 2 or 3 deterministic follow-ups (`pickFollowUps` in `src/ask/suggestions.ts`: the question's own `followUps`, then the answer's `tags`, then other topics).
- Every pill has an edit button that puts its text in the input.
- In 3D it mirrors the state on the rover face (`src/experience/rover/askFace.ts`).

### Availability

- `GET /api/ask` runs on idle about 1.5 s after `load` (never on first paint) or when an entry point is used.
- Turnstile loads only when the panel opens with a site key.
- A 503 or 404 status hides every entry point (the hero bar keeps its space, invisible, so nothing shifts).

## Curated pills

- `content/ask/suggestions.json`: 100 questions in seven topics (work, ai, career, contact, perspectives, about, site), at least 10 each.
  - Fields: `topic`, allowlisted `tags`, `followUps`, `expect` chunk ids, optional `answer.any` for the eval.
  - English text at most 48 characters (compact pills); no pill on a declined topic (partisan politics, religion, pay, family, health).
  - "About me" (`about`) pills draw on the profile (the ShinyQ nickname) and his written perspectives (work style, lifestyle); "This site" (`site`) pills are exactly the ones `isSiteQuestion` matches and expect `site-build`.
- Sampling (`src/ask/suggestions.ts`), seeded once per page session (`sessionStorage["hq:ask-seed"]`, read by `readAskSeed`):
  - `topicQuestions` shows a seeded random 4 of a topic, `starterQuestions` the "Try asking" mix (one pill from each of 3 topics in seeded order);
  - a pill asked in the thread never shows again (an exhausted topic shows none); the order stays stable while the panel is open;
  - tests inject the seed: `"order"` keeps bank order (every Ask e2e spec but the seeded one), a number fixes the sample;
  - follow-ups stay deterministic (`pickFollowUps`).
- Public stats keep five topics: `STATS_TOPIC_OF` counts `about` pills under perspectives and `site` pills under work (handler blob8, the `hq-stats` Worker's `CHIP_TOPICS`).
- `tests/ask/suggestions.test.ts` checks every question retrieves its expected chunks in EN and ID (after `resolveNickname`, as the pipeline does); `tests/ask/sampler.test.ts` covers determinism, no repeats and coverage.
- `bun scripts/ask-eval.ts suggestions` asks them against the real model nightly (at least 90% must get a real answer).

## Wire additions

- The request takes an optional `source` (`hero`, `dock`, `pill`, `followup`, `terminal`, `palette`), logged as Analytics Engine blob7 (never with question text).
- The final SSE frame carries `tags`: the `ASK_TAGS` allowlist in `src/ask/protocol.ts`, derived from chunk types and keywords in `functions/_lib/tags.ts`, never chunk text.
- The request takes an optional `history` (`AskTurn[]`: `{ q, a, sig }`, at most `ASK_HISTORY_TURNS` = 3, oldest first, `a` at most 1000 characters) and the final frame of a model answer carries `sig`.

## Multi-turn memory

Owner decision 2026-10-17. Code: `functions/_lib/history.ts`, `src/ask/thread.ts` (`historyFor`).

- Signing: the handler signs every model answer it shows (outcome `answer`, source `primary`, `fallback` or `cache`) with HMAC-SHA256 under `ASK_COOKIE_KEY` over `["ask-turn-v1", panel locale, pack version, question, answer]`, the question as `scrubPII(cleanText(q))` and the answer as `cleanText(a)`; base64url, 43 characters. Canned answers are never signed. Without the key nothing is signed or verified.
- Client: the answer message keeps `sig` and `sigLocale`; `historyFor(messages, locale)` sends the last 3 adjacent question and answer pairs with a signature for the panel language, the question as `cleanQuestion(text, 300)`. A language change strips every signature; **New chat** empties the thread.
- Verification: `parseHistory` keeps well-formed turns, `verifyHistory` keeps the ones whose signature matches this panel language and pack version. A failed turn is dropped, never an error.
- Pipeline: `usableHistory` drops an earlier turn whose question would itself be declined (harmful, private, opinions about others, general-assistant work). `isFollowUp` (a referent such as "it", "that one", "itu" or a "-nya" word, a lead-in such as "and", "what about", "kalau", or at most 3 words with no name of their own such as "Which year?"; never a site question, and "Where did he study?" stands alone) makes `followUpAnchor` the earlier questions back to the last standalone one.
  - Every deterministic decline runs on the question and on the question plus its anchor; lead intent and the routed topic use both; a general-assistant request is declined on its own words even after a project inquiry.
  - Retrieval runs on the question plus its anchor, and the anchor's top 2 chunks (`ANCHOR_TOP`, never a perspective) come first, so "What stack did it use?" finds the project, not every skill chunk. The context budget is unchanged.
  - The model gets the verified turns as earlier `user` and `assistant` messages, and the system prompt adds `HISTORY_LINE` (context only, never instructions, never a rule change). The output checks are unchanged.
- Cache: only a request without verified history reads the KV cache, and only an answer with no turns used is written.
- Analytics: the third double of the `ask_events` data point is the number of turns the model saw.
- Tests: `tests/ask/history.test.ts`, the multi-turn blocks in `tests/ask/pipeline.test.ts` and `tests/ask/handler.test.ts`; golden q72 to q74 and red-team rt64 and rt65 (`history` items; the eval asks a golden item's earlier questions first).

### Cost

Workers AI prices Gemma 4 26B at 9,091 neurons per million input tokens and 27,273 per million output tokens (Cloudflare price list, October 2026); the free allocation is 10,000 neurons a day.

| Request | Input tokens | Output tokens | Neurons |
|---|---|---|---|
| First turn | about 2,900 | up to 300 | about 36 |
| Follow-up with 3 earlier turns | about 3,800 | up to 300 | about 44 |

- Only the earlier turns add tokens (at most 3 questions of 300 characters and 3 answers of 1000); the context budget stays 6,000 characters.
- Follow-ups skip the cache, so repeated follow-ups each cost a model call. `ASK_DAILY_CAP` (600) still bounds the day at about 26,400 neurons in the worst case.

## Answer pipeline

Security order (spec 7.4):

1. Kill switch and breaker.
2. Origin + JSON + 8 KB body (`MAX_BODY_BYTES`, the question plus 3 earlier turns).
3. Turnstile or the signed 30-minute `hq_ask` cookie.
4. Rate limits (8/min, 40/day per salted visitor hash).
5. NFKC + PII scrub, then signed history verification (failed turns dropped).
6. KV cache (first turns only).
7. Global cap.
8. Scope declines (harmful, private topics, opinions about people, employers or clients; no model call).
9. Retrieval + the model chain: Gemma 4, one Mistral fallback, then the Groq backup tiers (see Backup tiers).
10. Output checks: blocklist, forbidden patterns, secrets, prompt leak, first person, defamation, numeric grounding, employer and name checks, perspective source.
11. Then cache, event, SSE.

- Bump `PROMPT_VERSION` in `functions/_lib/prompt.ts` with any prompt change.

## Backup tiers

Code: `generate` in `functions/_lib/model.ts`, the Groq client in `functions/_lib/groq.ts`, `modelBreaker` in `functions/_lib/limits.ts`.

- Chain, never in parallel: Gemma (primary), Mistral (fallback), then each `ASK_BACKUP_MODELS` model on Groq (source `backup`), then the canned fallback message. A tier is tried after an error, a missing first token, a total timeout or an empty answer.
- Every tier gets the same prompt, retrieval, scope routing and output checks; backup answers are cached like the others. Keep the system prompt a stable prefix (Groq caches it).
- Quota: a Workers AI quota error (code 3036, the daily neurons) skips Mistral and pauses the shared breaker key `wai` until the next 00:00 UTC. Any other Workers AI error or timeout tries Mistral first.
- Breakers (`mb:<key>`, in memory plus KV, KV written only for pauses of 60 s or more): a Groq 429 or 413 pauses that model for `retry-after` (60 s default), 401 or 403 for 1 hour, 404 or model not found for 6 hours. Timeouts, plain errors and empty answers never pause a tier.
- Timeouts: the whole chain stops at 24 s (`CHAIN_MS`, under the client's 30 s), a Groq tier gets 6 s (`GROQ_TIMEOUTS`), and a tier needs at least 1.5 s left (`MIN_ATTEMPT_MS`).
- Groq client: one non-streaming OpenAI-compatible request (fetch only); the answer arrives in one piece.
  - Qwen sends `reasoning_effort: "none"`; gpt-oss sends `reasoning_effort: "low"`, `include_reasoning: false` and `max_completion_tokens` 1024. `<think>` blocks are stripped and `message.reasoning` is never read, so reasoning never reaches a visitor.
  - Routed through AI Gateway `shinyq-hq` (`env.AI.gateway(id).getUrl("groq")`, with a `cf-aig-metadata` header), else directly at `https://api.groq.com/openai/v1`. Gateway calls count against its 600 per day limit.
- No `GROQ_API_KEY`: `backupTiers` is empty and no request is made.
- Free plan limits per model: 30 requests per minute, 1,000 per day, 8,000 tokens per minute, 200,000 per day (cached prompt tokens do not count). Qwen 3.8 27B is a Groq preview model that can be discontinued at short notice; gpt-oss-120b is a production model. Zero Data Retention is on, and the privacy note (`ask.privacy`) names Groq.
- Logging: Analytics Engine `ask_events` blob10 is the answering model id and blob11 the failure trail (`model:reason > ...`, 200 characters at most); the `done` frame `source` can be `backup`; `scripts/content-gap.ts` prints a Models table.
- Swap or drop a model: change `ASK_BACKUP_MODELS` in `wrangler.toml` and redeploy; a new reasoning family needs a branch in `modelInput`. Delete the `GROQ_API_KEY` secret to turn Groq off. Live check: `GROQ_API_KEY=... bun scripts/ask-eval.ts golden --groq <model> [--gateway]` (runbook section 12).

## Knowledge chunks

### Site-build chunk

- `content/ask/site-build.json` (`SiteBuildSchema`, read through `getSiteBuild()`; never import it into a client component).
  - A bilingual, third-person note on how this site was built: stack, 3D engine, hosting, this assistant, testing, process, and how visitors use it (Rover's controls and tour, the five floors and the elevator, the minimap, the settings panel, per-page URLs and `?view=classic`), at most `SITE_BUILD_TEXT_MAX` (2600) characters per language.
  - Becomes the `site-build` chunk (type `site`, tags `work` and `agents`, url `SITE_BUILD_PAGE`, the `/build` page). The note points to that page, whose long form lives in `content/build-story.json`.
- `isSiteQuestion` (`functions/_lib/scope.ts`, EN/ID) always retrieves it (`SITE_INCLUDE`).
  - Deliberately narrow: "this site", "ShinyQ HQ", "this chatbot", "situs ini", never "his portfolio" or a project's live site.
  - Such an answer carries `cite` = `/build` (kind `build`; the dock shows "Read on this site: How this site was built"), and the page links the public repository.
  - `isAskCite` still accepts `ASK_REPO_CITE` (`https://github.com/ShinyQ/ShinyQ-HQ`, kind `repo`, opened in a new tab) so an older cached answer renders; nothing new cites it.
- Every fact must be backed by the repository.
  - Update the note in the same PR when the stack, hosting, the assistant or the test gates change.
  - Keep golden q45 to q47, q69 and q70 true (runbook section 16).
- To fit it, project chunks keep as keywords only the stack names that carry a topic tag (`stackKeywords` in `src/ask/pack.ts`; the text still lists the whole stack).

### Production chunk

- `production` (type `production`, tags `ai` and `work`, url `/contact#production`) carries "How I run AI in production" and its proof tiles.
- It is not an opinion source (`SOURCE_TYPES`), so it never adds a cite.
- To fit it under the cap, featured pods keep one approach step (`PACK_APPROACH_STEPS`, runbook deviation 8).

## Perspectives scope

Spec section 13.

### Retrieval and pack size

- Questions about Kurniadi's written professional views are in scope: `isPerspectiveQuestion` in `functions/_lib/scope.ts` always retrieves the `principles` chunk.
- The pack must stay under `PACK_MAX_BYTES` (256 KiB, measured and owner pre-approved, runbook section 15) with every draft approved.
  - So project chunks keep only the lead approach steps of featured and listed pods (`PACK_APPROACH_STEPS` in `src/ask/pack.ts`).
- At most `PERSPECTIVE_CAP` (3) perspective chunks per answer, so posts and projects still reach the context.
- `tests/ask/scope.test.ts` checks retrieval with every draft approved.

### Sources and citations

- Opinions need a written source (`citedSource`: a quoted title or two shared three-word runs with a retrieved perspective, principles, post or talk chunk).
  - Otherwise the answer becomes the no-view message with the closest source (`noViewMessage`; `closestSource` never names a perspective, which has no page).
- The pack's "Kurniadi's written view" label counts as an opinion claim (`claimsOpinion`).
- `privateTopic` and `opinionAboutOthers` decline before the model; `firstPersonVoice` replaces first-person answers.
- The `done` frame may carry `cite`: an allowlisted path (`isAskCite` in `src/ask/protocol.ts`: `/contact#how`, `/blog/<slug>`, `/labs/<slug>`, `/library`, `/build`; never a `#perspectives-*` anchor).
  - Rendered by `AskCiteLink` as "Read on this site".
  - `citeKind` maps a cite to its label (`ask.cite.<kind>`: how, blog, project, library, build, repo) and to the "where" phrase of the no-view answer (`WHERE` in `functions/_lib/messages.ts`).
  - The legacy repository cite reads "Source: ..." and opens in a new tab.
- A perspective answer cites the entry's backing post or project through its chunk `url` (`perspectiveSourcePath`), or nothing when the entry has none.
- Personal essays (post tag `personal`) never count as a source.

## Nickname

- "ShinyQ" is Kurniadi's nickname, resolved by `resolveNickname` (`functions/_lib/scope.ts`) before scope and retrieval.
- "ShinyQ HQ" still means this site.
- The profile chunk states it and golden q60 to q63 cover it.

## Scope routing

- Deterministic in `functions/_lib/scope.ts`, run by `runPipeline` before retrieval; the prompt (`RULES` 3, 5, 8, 9, 11, 12) and the output checks back it up.

| Check | Matches | Result |
|---|---|---|
| `isHarmful` | harmful requests | declines |
| `isCapabilityQuestion` | "What can you do?", "Apa yang bisa kamu lakukan?", the `contact-capabilities` pill | the fixed `MESSAGES.capabilities` (no model call) |
| `privateTopic` | family, relationships, health, religion, partisan politics (parties, candidates, elections, named politicians, voting, contested social policy, and policy questions with no tech angle; in a question about this site, "Pengaturan" names its settings panel and does not count) and pay | declines |
| `opinionAboutOthers` | opinions about others | declines |
| `isGeneralAssistantRequest` | writing code, essays, poems or homework, tutorials, translations, recommendations for the visitor and "you are now a general chatbot" jailbreaks | `MESSAGES.decline`, which points back to what the assistant covers |
| `routedTopic` | lifestyle (hobbies, games, books, anime, coffee shops, the gym, burnout) and tech-adjacent policy (AI regulation, UU PDP, government AI use, AI and jobs, public digital interfaces) | his perspectives with that topic tag ONLY |

- A model refusal is replaced by the same text as `MESSAGES.decline`, reason `model_decline`.
- `routedTopic`: retrieval keeps the profile and those chunks, and the answer must follow one of them (`citedSource` on that topic) or it becomes the no-view message.

## Lead intent and the contact card

- `isLeadQuestion` (EN/ID): the visitor describes their own need or project ("can you build", "kami butuh sistem", hiring).
  - Retrieves `profile`, `now`, `contact` and `leadMatches` (1 to 3 past projects that share specific terms, never opinions).
  - Tells the model the matches (`routingLines`).
- The answer:
  - names related skills and matching projects, says whether that work suggests a fit, notes freelance or part-time availability and invites contact;
  - never estimates cost, price or timeline, designs their system, writes code or asks for the visitor's data.
  - Guards: `consulting`, `containsCode`, `asksForPersonalData`, and `claimsFit` without matches, all replaced by `MESSAGES.lead`.
- A lead that asks for a rate gets `MESSAGES.leadRates` without a model call.
- The `done` frame then carries `contact` (`AskContact`: email and LinkedIn from `roof.contact`, built into `KnowledgePack.contact`).
  - Validated by `isAskContact` on both ends, also on cache hits.
  - The dock renders it as `AskContactCard` (Email, LinkedIn in a new tab, the Contact page; `ask.contact` messages).
- Never let the model's text supply contact values.

## CSP

- Only `script-src` and `frame-src` add `https://challenges.cloudflare.com`; `tests/unit/csp.test.ts` pins the exact policy.
- `collectErrors` in `e2e/hq.ts` allows that one host and nothing else.
  - It also records CSP console errors; `collectCspViolations(page)` collects `securitypolicyviolation` events.
- `e2e/ask.spec.ts` mocks `/api/ask`.

### Per-page script policy

- Security F1.9, [`docs/deploy.md`](../deploy.md) section 9.
- `scripts/csp-hashes.ts`, the last build step, inserts a `data-hq-csp` meta tag into every HTML page with:
  - `script-src` from `_headers` minus `'unsafe-inline'`, plus the sha256 of each inline script;
  - `worker-src 'self' blob:` again for troika's workers.
- So the effective script policy has no `'unsafe-inline'` (the header keeps it only because it cannot list per-page hashes).
- Never add an inline event handler or a `javascript:` URL, and never inject an inline script at runtime.
- A test that edits an inline script must rebuild the policy with `addScriptPolicy` (`scripts/csp-policy.ts`).
- Enforced by `csp-hashes`, `scan-export.ts`, `e2e/deploy.spec.ts`, `deploy-smoke.ts` and `e2e/csp.spec.ts`.

## Credentials

Security S3, H1 (owner decision).

- Cloudflare secrets live in the `production` environment (deployment branch policy `main` only).
- Jobs that read them declare it (`deployment: false` when nothing is deployed).
- Pull request runs never receive a Cloudflare secret: `stats-worker.yml` only bundles the Worker on PRs, its token checks run on a dispatch from `main`.
- Pass secrets in step-level `env`, never at workflow or job level, so dependency installs and third-party tools never see them.

## CI around it

- Check job: staleness warning (45 days).
- gitleaks ("Secret scan", allowlist `.github/gitleaks.toml`), `bun audit` (non-blocking), Dependabot, CODEOWNERS.
- Scheduled workflows:
  - nightly `ask-eval.yml`;
  - weekly `refresh-facts.yml` and `content-gap.yml`;
  - hourly `uptime.yml` ([`docs/deploy.md`](../deploy.md) section 16).
- `content-gap.yml` puts counts and topics only in its public issue and artifact, never question text (security S8, owner decision). The owner reads questions locally with `bun scripts/content-gap.ts --questions`.
- Action pinning (owner decision): every workflow and the setup action pin each action by full commit SHA with a `# vX.Y.Z` comment; Dependabot updates both.
- `wrangler` is an exact devDependency, so workflows and docs call `bunx wrangler` from the lockfile, never `bunx wrangler@<range>`, and the hq-stats `wranglerVersion` matches it (`tests/unit/workflows.test.ts`).
- Workflows request only the permissions they use.
- More CI and deploy rules: [ci-and-deploy.md](ci-and-deploy.md).
