# Benchmark Article Update and Reading Navigation

Status: Written specification approved by the owner on 8 November 2026; implementation remains subject to plan approval.

## Goal

Add useful, confidentiality-safe lessons from later benchmark work to the existing ten-day retrospective, in English and Indonesian. Replace the cramped "On this page" navigation across blog articles and case studies with the selected B compact reading panel.

This specification is a session artifact. It authorizes no repository edits, commits, pushes, pull requests, merges or deployments.

## Confirmed Decisions

- Keep the original benchmark title, URL and ten-day story.
- Add a distinct later-lessons section rather than rewriting the original period as current results.
- Update both English and Indonesian independently, then reconcile the facts.
- Apply navigation B to all hosted blog articles and case studies.
- Desktop: one neutral frame, numbered rows, chapter count and a subtle filled current row.
- Narrow screens: a collapsed native contents disclosure above the body.
- Preserve existing fonts, colour tokens, content layouts, accessibility and budget limits.

## Evidence and Publication Boundary

The article and reader implementation were inspected on portfolio main `3cfbe6c8ed6097686030f63d27090ef52eace81d`. Current merged and open authored benchmark PRs were checked privately, including subsequent review corrections.

Only general engineering lessons may cross into the public article. Do not publish client names, private repository names or URLs, PR identifiers, task names, identifying scenarios, task mechanisms, input records, answer keys, hidden tests, reviewer identities or quotations, artifact locations, per-task scores or model-by-task results.

Replacing a name is not sufficient anonymization. Remove the identifying mechanism and the combination of details that could reconstruct a task. Any illustrative example must be clearly synthetic, generic and unrelated to the private tasks.

Keep the public Terminal-Bench name. Preserve the distinction between submitted, approved and merged work. Later hard-rated work is not evidence that every newer task was very hard. Do not imply that a current aggregate counts the original ten submissions.

## Article Design

### Preserve the Original Account

Keep the existing publication date, 2 November 2026, and the original opening: first benchmark work, ten tasks submitted in ten days, five merged by publication, and most rated very hard. The original title remains a historical title, not a live progress label.

Keep existing heading text and anchors, the two current diagrams, code examples and links. Do not rewrite strong paragraphs simply to increase the diff.

Frame statements about the original workflow and approval process as belonging to that period. Do not expand historical claims about human-authored instructions, approvals or agent speed into unsupported claims about all later work.

### Add Later Lessons

Add one h2, "After the first ten days", before "What I would keep and change". Use a natural Indonesian equivalent. State explicitly that this section covers later work, with a truthful revision date.

Develop four short h3-level lessons:

1. **Verify dependencies against the evidence.** Plausible output and familiar tooling do not prove correctness. Explain the value of checking a dependency's result against independent evidence. Some agents noticed discrepancies without completing a general repair; do not describe that as never inspecting or understanding the tool.
2. **Test the grader itself.** Accept equivalent correct representations while enforcing the required schema and values. Reject consistently wrong results even when a program reproduces its own output. Self-consistency is not an independent answer key.
3. **Make repairs survive fresh inputs and state.** A patch that fixes the visible example is weaker than a deliverable that works on another legitimate input and remains correct when rerun. Keep this explanation general, without revealing a particular task's topology or recovery mechanism.
4. **Scope claims to observed behaviour.** A component working on covered examples does not establish that an entire input family works. Ground descriptions in replayed behaviour, and distinguish recognition of an error from a successful repair.

Target approximately 350 to 500 added words in English, not a second article appended to the first. Remove repetition where it obscures the new lessons. Indonesian should preserve the same depth without mechanical translation or matching English word counts.

A suitable public tone is:

> Later reviews made me look more closely at the evaluation itself. A program could reproduce its own report and still be wrong. A correct result could also be rejected because the grader treated an equivalent representation as a different answer. Those are different defects, and neither is evidence that an agent lacks the skill being measured.

### Reconcile the Ending

Keep the original reflection recognizable. Anchor its "half still waiting" statement to the original period rather than leaving it as a current claim. Fold the later lessons into the closing checklist without adding a PR scoreboard or proprietary examples.

Keep the original title unchanged. Keep the excerpt unless the approved prose requires a narrow excerpt adjustment. If an excerpt changes, update its frontmatter and registry values together, preserving the historical sample boundaries. Reading time comes from the existing word-count helper.

Set `updated: "YYYY-MM-DD"` in each changed translation to its actual significant revision date. The existing `postUpdated` path drives the visible Updated label, structured data, feed timestamps and sitemap lastmod. Do not change publication dates or invent build-time dates.

## Navigation B

### Shared Appearance

Use the existing `CaseToc` and its supplied item order, not an unrelated navigation library. Preserve the blog's existing rule that contents appear only when there is more than one top-level heading.

- One neutral, near-opaque frame with modest corner rounding and no backdrop blur.
- Header: existing localized "On this page" label plus a localized count derived from the actual items.
- Rows: real sequential chapter numbers, a consistent number column and full labels.
- Current row: restrained existing-token fill and stronger text, without the oversized violet outline and glow.
- Hover and keyboard focus remain distinct and visible. No coloured edge stripe.
- Natural multiline labels, readable line height and padding. No ellipsis or forced one-line labels.
- Touch targets at least 44 CSS px. Visible numbers are decorative to accessible link names; names continue to match the heading labels.

### Desktop Placement

From the current desktop breakpoint of 1280 px, the panel occupies the available right gutter. Give it more usable width where the gutter allows, while never overlapping the article or clipping its labels.

Keep the blog head, body and end on the same centred 38rem reading measure. Keep existing case-study content columns and chapter order. Place the contents before the body in source order as well as on narrow screens; explicitly preserve the existing desktop grid positions.

Bound the desktop list by the available viewport height, with the header visible and vertical overflow only when needed. Keyboard-focused links must remain reachable. Do not scroll the page in response to scroll-spy updates.

Retain wide-diagram avoidance on desktop, including focus keeping the navigation visible. Recalculate its occupied band when wrapping, panel height or viewport size changes. Never apply desktop diagram hiding to the inline narrow-screen disclosure.

### Narrow Screens

Below 1280 px, show a collapsed native `details`/`summary` contents block above the body on both page types. Opening it reveals the same complete ordered links. The expanded list participates in normal page flow, not a nested touch scroll area.

Do not introduce a modal, floating bottom control, sticky phone overlay or custom gesture. The disclosure must be collapsed in the initial server-rendered HTML, with no hydration jump. It must open without JavaScript.

If desktop and narrow-screen wrappers require mirrored lists, keep only one exposed at each breakpoint, with one named navigation landmark, no duplicate element IDs and identical targets and current state.

### Behaviour to Preserve

- Existing real fragment links and heading IDs.
- Scroll-spy driven by the existing heading targets.
- No-JavaScript anchor navigation.
- Native focus and link semantics, including modified clicks.
- Existing phone header hiding, Ask control behaviour and reading progress.
- The quiet availability rule: never add the closing availability section to the case-study contents or redirect any result to it.

## Sources and Integration

| Area | Relevant files |
|---|---|
| Article | Both `content/blog/ten-very-hard-benchmark-tasks-in-ten-days.{en,id}.mdx` files |
| Registry compatibility | Matching post in `content/site-content.json`, only if excerpt values change |
| Shared navigation | `src/components/page/CaseToc.tsx` |
| Layout placement | `src/app/[locale]/blog/[slug]/page.tsx`, `src/app/[locale]/labs/[slug]/page.tsx` |
| Styles and labels | `src/app/pageview.css`, the existing `case` namespace in `messages/en.json` and `messages/id.json` |
| Existing contracts | `tests/hud/CaseToc.test.tsx`, `tests/content/blog-mdx.test.tsx`, relevant existing content, SEO and Ask checks, `e2e/pageview.spec.ts`, `e2e/pageview-visual.spec.ts` |
| Derived content | Existing Ask knowledge build and embedding workflow |
| Documentation | Relevant current reader/content rules and feature guide, plus dated approved design and plan copies during authorized implementation |

Keep heading extraction, routing, retrieval algorithms, prompt behaviour and safety guards unchanged. Refresh derived content using existing scripts after the authoring source freezes. Confirm no missing or stale vectors and that the knowledge pack remains within its current limits.

## Boundaries

- No changes to the private benchmark repository.
- No new dependencies or unrelated component refactors.
- No new unit-test cases or files, following the owner's project instruction. Existing assertions may be adapted to intentional markup changes without weakening coverage; browser coverage can verify the new responsive behaviour.
- No rewriting other articles or case-study bodies. Protected Sun/Moon content, frontmatter, registry text, quotations and footnotes stay unchanged.
- CV, papers, published guides and 3D content stay unchanged.
- No new layout, HTML, CSS, JavaScript, font or Ask-pack budget increases.
- Preserve bilingual keys, ICU semantics, SEO limits and the existing domain and canonical routes.

Current relevant caps remain CSS 20,480 B, HTML 83,968 B, JavaScript 245,760 B and fonts 60 KB. Preserve the blocking Lighthouse thresholds of LCP 2 s, CLS 0.01 and TBT 200 ms, plus Ask-pack text 384 KiB, stored data 768 KiB and fallback 24 KiB.

## Acceptance and Review

1. Both article translations contain the agreed later lessons, with historical and ongoing results correctly separated and no confidential fingerprint.
2. Existing article and case-study anchors still work; only the new lesson section adds a new top-level blog anchor.
3. The panel renders cleanly on long and short documents, dark and light themes, desktop, phone, landscape phone and narrow tablet widths.
4. Full labels, native keyboard use, touch targets, no-JavaScript behaviour and reduced motion are preserved.
5. Wide diagrams and the navigation never obscure each other.
6. The centred blog measure, case content columns, header behaviour and protected sources remain intact.
7. Existing repository verification, affected browser checks, accessibility and the applicable Lighthouse budgets succeed without weakening assertions or increasing caps.
8. Ask-derived content and update metadata reflect the final public sources.
9. Present a local review page, representative before/after captures and a concise editorial comparison before requesting any publication authorization.

## Execution Boundary

After the owner reviews this written specification, write the implementation plan in the coordinating session's `plan.md`, preserving the previous completed plan. Repository work starts only after plan approval, in a fresh isolated coding session.

The article lane and shared-navigation lane may run independently. Serialize builds, tests, embedding refreshes and final browser work after the sources are integrated. Public repository sessions receive the sanitized specification and approved prose, not raw private review material.
