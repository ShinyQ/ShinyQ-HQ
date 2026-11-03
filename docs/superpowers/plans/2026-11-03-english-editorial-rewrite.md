# English Editorial Rewrite Implementation Plan

Status: in review

> Approved implementation plan, recorded for local owner review. The original
> detailed checklist remains in the coordinating session's `plan.md`; this
> repository copy preserves its tasks, ownership, commands and acceptance gates.

**Goal:** Make all public English writing natural and technically grounded while
preserving depth, evidence, confidentiality and existing behaviour.

**Architecture:** Edit authoritative sources, not generated pages or duplicated
component text. One coding session owns integration and the shared dataset.
Two bounded editorial agents may edit English MDX and interface copy in
parallel. The integrator handles the dataset, other sources and validation.

**Stack:** Next.js static export, TypeScript, Bun, next-intl, JSON content, MDX,
Vitest, Playwright and the existing Ask pipeline. No new runtime dependencies.

## Global Constraints

- Follow the [approved design](../specs/2026-11-03-english-editorial-rewrite-design.md).
- Read current root `AGENTS.md`, `CLAUDE.md` and relevant area rules.
- Start from current remote main in an isolated session, never the primary checkout.
- Prefer `rtk` for Git; use native Git for exact machine-readable comparisons.
- No em dashes or first-person titles, mottos, taglines or share cards.
- Preserve facts, dates, numbers, confidence, measurement limits and team credit.
- Add detail only from approved evidence; flag unsupported gaps.
- Preserve Indonesian, rendered fallbacks, documents and the complete Sun/Moon family.
- Preserve keys, ICU syntax, slugs, links, citations, code, diagrams and publication state.
- Do not publish drafts, translate external articles or rewrite official names or quotes.
- Do not change layout, runtime behaviour, Ask routing, safety or budgets.
- Review every passage, retaining good existing writing rather than forcing changes.
- Install dependencies only after a missing-tool or missing-package failure.
- Local implementation approval does not authorize push, PR, merge or deploy.

## Ownership and Dependencies

| Task ID | Owner | Sources | Prerequisite |
|---|---|---|---|
| `rewrite-audit` | Integrator | Approved artifacts, current source inventory and baseline | None |
| `rewrite-dataset` | Integrator | `content/site-content.json` | Audit |
| `rewrite-articles` | Article editor | Ten English MDX files below | Audit |
| `rewrite-interface` | Interface editor | `messages/en.json`, English in `functions/_lib/messages.ts` | Audit |
| `rewrite-other` | Integrator | Other approved public sources below | Audit |
| `rewrite-integrate` | Integrator | Registry metadata, Ask artifacts, tests and docs | All four editorial tasks |
| `rewrite-final` | Integrator | Export, preservation, coverage and review artifacts | Integration |

Only the integrator edits the shared dataset. Article editors return exact
slug/title/excerpt handoffs. Shared-source tests wait until writers pause and
registry metadata is aligned. Never run multiple full builds concurrently.
`src/lib/seo.ts` and `src/lib/jsonld.ts` are consumers: edit their inputs, not
their algorithms. Internal prompts and router exemplars are not public prose.

## Existing Limits

| Surface | Limit |
|---|---|
| Rover mission / terminal line | 40 characters |
| Rover dialog line | 110 characters |
| Perspective question / answer | 120 / 640 characters |
| Final SEO description | 140 to 160 characters |
| Ask site-build source | 2,800 characters per language |
| Ask retrieval context | 6,000 characters, unchanged |
| Ask text / stored / fallback pack | 384 KiB / 768 KiB / 24 KiB |
| Classic HTML / JS / CSS / fonts | 82 KB / 240 KB / 20,480 B / 60 KB |
| Classic LCP / CLS / TBT | 2 s / 0.01 / 200 ms |

Current source checks win over this baseline. Never loosen a limit or remove
an evidence caveat to fit prose.

## Task 1: Establish Coverage and Preservation Baselines

Read the approved design, root rules, `DESIGN.md` and the content, style, Ask
and i18n area guides. Record the base SHA and clean/dirty state, keeping unrelated
changes intact. Inventory every authoritative public English source, including
metadata, accessibility, errors, empty states, 3D signs, drawers, suggestions,
fixed Ask responses and generated-copy inputs.

Keep the inventory in session artifacts. Record every dataset section, article
and message namespace as edited, retained or excluded, with reasons and owners.
Capture Indonesian values, shared facts and protected essay records. Identify
shared strings whose edits would change Indonesian output.

```bash
bun run validate:content
bun run test tests/content/portfolio-copy.test.ts tests/content/technical-copy.test.ts tests/unit/ui-copy.test.ts tests/unit/dialog-copy.test.ts tests/unit/seo-copy.test.ts --maxWorkers=2
```

Reproduce and record pre-existing failures without weakening checks. Give the
two editors the approved voice, exclusions, ownership and exact file lists.

## Task 2: Rewrite the Main Dataset

Review all profile and working principles, production explanations, 37 career
entries, 40 projects, awards, certifications, skills, side projects, repository
descriptions, library, contact and missions. Connect list-like prose when that
helps understanding. Keep problem, role, approach, story, result and confidence
distinctions. Explain supported constraints and decisions, not inferred outcomes.

Preserve `n=4`, offline development results, the missing 22-pair rerun,
in-sample research, colleague-led Cowork ownership and all compact caveats.
Retain the protected essay registry exactly. Hold article registry edits until
the article editor supplies metadata.

```bash
bun run validate:content
bun run test tests/content/portfolio-copy.test.ts tests/content/technical-copy.test.ts tests/content/production.test.ts tests/content/cv-facts.test.ts tests/content/first-person.test.ts tests/content/taglines.test.ts tests/content/title-case.test.ts tests/unit/ui-copy.test.ts --maxWorkers=2
```

Expected: no schema, ownership, caveat, localization or title regression.
Record reviewed sections and retained passages in the coverage ledger.

## Task 3: Rewrite Every Hosted English Article

Edit only these sources:

- `content/blog/45-percent-of-our-llm-calls-failed.en.mdx`
- `content/blog/aria-acs-to-livekit.en.mdx`
- `content/blog/clearbox-inbox-cleanup-with-microsoft-decision-1.en.mdx`
- `content/blog/making-a-voice-agent-interruptible.en.mdx`
- `content/blog/spec-driven-development-with-ai-coding-agents.en.mdx`
- `content/blog/ten-very-hard-benchmark-tasks-in-ten-days.en.mdx`
- `content/blog/the-lock-that-protected-the-install-also-blocked-the-app.en.mdx`
- `content/blog/the-stall-that-was-never-in-the-query.en.mdx`
- `content/blog/untrusted-code-next-to-production-secrets.en.mdx`
- `content/blog/why-the-better-fraud-engine-shipped-in-shadow-mode.en.mdx`

Read each whole article, preserving its narrative rather than imposing a
template. Rewrite awkward phrasing, jargon and abrupt transitions. Connect
observations to decisions and keep limitations beside claims.

Keep code fences, citations, links, architecture references, self-closing tags
and linked heading anchors. Retain headings if improving them would break an
anchor through existing MDX support. Keep caveats in excerpts and opening
paragraphs used by Ask.

The benchmark post stays about method, not proprietary tasks. Do not add LILT,
task details or refreshed counts. Retain "very hard", first benchmark work and
ten tasks in ten days; do not turn submissions into merges.

Return exact title/excerpt values keyed by unchanged slug. The integrator
applies them before the alignment checks:

```bash
bun run test tests/content/blog-mdx.test.tsx tests/content/post-diagrams.test.ts tests/content/technical-copy.test.ts tests/content/title-case.test.ts tests/content/first-person.test.ts --maxWorkers=2
```

Expected: valid MDX, unique unchanged anchors, resolved figures, aligned
frontmatter and registry, and intact compact evidence limits.

## Task 4: Refine Interface and Rover Copy

Read every English namespace in context: navigation, controls, dialogs, HUD,
missions, office, readers, errors, empty states and accessibility. Keep good
literal controls. Guidance names controls and useful next steps; Rover is the
guide, not the owner.

Edit only English values in fixed Ask responses. Preserve topic and refusal
boundaries, anonymous-analytics distinctions, the separate 30-minute anti-bot
cookie, signed prior exchanges and New chat not clearing service logs.
Preserve keys, interpolation, plural branches and bounded line lengths.

```bash
bun run test tests/unit/ui-copy.test.ts tests/unit/dialog-copy.test.ts tests/unit/seo-copy.test.ts tests/unit/seo.test.ts tests/unit/og-cards.test.ts tests/ask/rover-voice.test.ts tests/ask/checks.test.ts tests/ask/pipeline.test.ts --maxWorkers=2
```

Expected: compatible dictionaries and ICU, valid line limits, metadata,
privacy and assistant behaviour.

## Task 5: Rewrite Remaining Approved Source Prose

Review English prose in `content/build-story.json`, `content/perspectives.json`,
`content/study-guides.json`, `content/sculptures.json`,
`content/blog/diagrams.json`, `content/ask/site-build.json` and
`content/ask/suggestions.json`.

Preserve repository quotations and generated facts. Edit only approved
perspectives, preserving views, qualifications and sources; never publish drafts.
Keep official guide names, credentials and document assets. Preserve diagram
topology, IDs, groups and canonical labels. Localizing a shared diagram label is
allowed only through existing representations and with identical Indonesian
output. Keep suggestion IDs, topics, source targets and summary limits.

```bash
bun run validate:content
bun run test tests/content/build-story.test.ts tests/content/perspectives.test.ts tests/content/study-guides.test.ts tests/content/post-diagrams.test.ts tests/content/shapes.test.ts tests/unit/diagram-layout.test.ts tests/ask/pack.test.ts tests/ask/suggestions.test.ts --maxWorkers=2
```

Expected: compatible sources, approved-only publication, valid diagrams,
suggestions and pack. Reconcile all sources in the coverage ledger.

## Task 6: Integrate Metadata, Retrieval and Documentation

Wait for all editorial tasks. Align English registry title/excerpt with MDX,
preserving dates, slugs and the essay. Inspect final SEO, OG and structured data
through existing helpers. Correct source wording, not generation algorithms.

```bash
bun run build:knowledge
bun scripts/ask-embed.ts --dry
bun scripts/ask-embed.ts --cli
bun scripts/ask-embed.ts --check
```

Use the existing authenticated embedding workflow and cache. If authentication
is unavailable, report the exact blocker. Never add credentials, fake vectors,
remove the missing-vector gate or claim retrieval was fully verified.

Update wording-dependent golden expectations only when justified by the source,
keeping factual predicates and live placeholders.

```bash
bun run test tests/ask/pack.test.ts tests/ask/pack-artifacts.test.ts tests/ask/golden-facts.test.ts tests/ask/suggestions.test.ts tests/ask/pipeline.test.ts tests/ask/hybrid.test.ts tests/content/technical-copy.test.ts tests/unit/topic-index.test.ts tests/unit/seo-copy.test.ts tests/unit/og-cards.test.ts --maxWorkers=2
```

Update `docs/agents/content-style-and-safety.md`, `docs/content.md` and the
relevant note in `docs/features.md`. Preserve the approved design and plan in
their dated paths and add a dated owner decision, with truthful plan status.
Do not edit README structure or add Tailwind utility examples.

## Task 7: Verify Preservation, Reading Quality and Final Coverage

Run exact read-only comparisons against the recorded base for Indonesian
resolved views of all eight JSON sources. A localized `{ en, id }` node resolves
to `id`; all shared strings and structural facts remain part of the comparison.
Require the protected essay registry to match exactly. Require no changes to
`messages/id.json`, Indonesian MDX, CV, papers, guides or router exemplars.
Separately compare Indonesian TypeScript response branches, essay accessibility,
generated Indonesian text, rendered fallbacks and new/untracked files.

Read final English in context, including retained passages, for evidence,
rhythm, repetition, jargon and publication-time meaning.

```bash
bun run validate:content
bun run verify:quick
bun run e2e:changed
bunx @lhci/cli@0.15.1 autorun
```

Do not run simultaneous stress jobs. Use repository-pinned Node and existing
Chrome, with unchanged Lighthouse thresholds. If the optional local tool is
missing, report that failure before restoring it or leave the equivalent gate
explicitly outstanding until PR publication is authorized.

Inspect desktop and phone examples: home/profile, Quick view, career, an
ordinary project, ARIA, a metrics-heavy project, the benchmark and another
technical article, build, Ask and 3D drawers. Check wrapping, controls, caveats,
overflow and flow, including corresponding Indonesian views and fallbacks.
Do not run full 3D perf/visual suites solely for string changes.

Reconcile every inventory item as edited, retained or excluded. Save the final
coverage report, readable editorial review, before/after captures and a ready
local preview as session artifacts. Verify readiness before reporting.
The final collection report is `files/english-rewrite-handoff.md` in the
implementing session and ends with `<!-- handoff-ready -->`.

Stop for owner review. No push, pull request, merge or deployment is authorized.
