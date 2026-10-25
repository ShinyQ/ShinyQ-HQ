# Classic recruiter pass: landing, case study stories, 404 and empty states

Date: 2026-10-25.

Status: in review

Owner request: "think something that is not just a feature but can impact the user who sees it". Ideas 1 (first 10 seconds), 2 (case studies as stories) and 6 (404 and empty states) were chosen as sub-project A of a six-part series. The rest of the series is out of scope here: L4 Writing revamp, B1 detailing, phone-first 3D, "Bring your problem", time-travel slider.

Choices were made in a brainstorming session with visual mockups. The mockups are kept in the session folder, not in the repo, because they only render inside the companion. Owner answers, in order:
1. The first 10 seconds are for **recruiters and hiring managers**.
2. The one action is **open or download the CV**.
3. The proof is **impact numbers**.
4. Six featured projects get the full story.
5. The story is text only: situation, role and decisions, result, lesson.
6. Keep the Neon Grid look; restructure content, hierarchy and CTAs only.
7. Hero approach 1 (recruiter-first, same look), with proof strip style B (one quiet strip).
8. Case study option B (the page reads as a story).
9. 404 option B (Rover plus "Did you mean...?").
10. "12+ enterprise clients" replaces "Building software since 2019" in `stats`.

## Constraints kept

- **Unchanged:** no new colors, fonts or dependencies; the Neon Grid backdrop, tokens and the three fonts stay.
- **Prior decisions stand:**
  - no illustration beside the hero name (the portrait stays);
  - no colored edge stripes;
  - the ticker has no "Updated" stamp or pause switch;
  - motion stops under reduced motion (`@variant motion-reduce`).
- **Classic budgets per page** (`lighthouserc.json`): CSS 20,480 B, JS 245,760 B, HTML 83,968 B, LCP 2 s, CLS 0.01. Nothing in this pass touches the 3D bundles.
- **Hard rules:**
  - no em dashes;
  - no first person in titles, taglines or page titles (chapter headings use "Role and key decisions", not "My");
  - bilingual `{ en, id }` for every string;
  - no client names (sector labels only);
  - content is data, never hard-coded career facts.
- **Lessons:** a lesson is the owner's opinion, so it is never invented. It is drafted only from the owner's own existing words and ships only after owner approval.

## Part 1: recruiter-first landing

**Hero** (`src/components/page/Hero.tsx`), top to bottom:
1. Portrait and name (unchanged).
2. `profile.headline` ("Forward Deployed AI Engineer") and `profile.subheadline` (unchanged).
3. **Proof strip** (new): one bordered strip, `surface` background, hairline dividers. Each cell is the value in Archivo display beside a short label (`pv-data` scale).
   - Phones: three equal cells with the value above the label.
   - The cells come from a new `profile.heroProof`: an array of exactly 3 stat ids, validated to exist in `stats`, in the order:
     - `enterprise-clients` ("12+")
     - `prs-merged-2026` ("1,190+")
     - `microsoft-certifications` ("5")
   - Each stat gets a new optional short label for the strip, `stat.short` (`{ en, id }`, at most about 28 characters), because the existing labels are sentence-length. Examples: "enterprise clients", "PRs merged in 2026", "cloud and AI certifications".
4. **CTAs:**
   - **View CV**: primary, a `[data-hq-cv]` link, so a plain click opens the shared PDF reader, which has Download. It is full width on phones.
   - **See the work** and **Enter the 3D HQ**: ghost (the 3D button keeps its gate behaviour).
5. Ask bar (unchanged).
6. Ticker: it now skips the three `heroProof` ids, so no number appears twice in the first screen.

**Stats change** (`content/site-content.json`):
- `shipping-since-2019` is removed.
- `enterprise-clients` is added:
  - value "12+"
  - label: "Enterprise clients served with Azure-native AI platforms since February 2026" (Indonesian translation alongside)
  - source: the career-intelligence evidence for the Metrodata delivery count (no client names)
  - confidence `verified`
- The count stays at 6, so the 3D Lobby stats ring keeps its six slots. The ring's labels change with the data, but no 3D code changes.
- Ask golden items that cite "since 2019" get updated if any exist.

**Section order** (`src/app/[locale]/page.tsx`):
- New order: Selected work → About and status (with View CV) → Journey → **Certifications** (moved up) → Skills → Live office → Writing → Contact.
- Selected work cards show the headline result line directly under the title, before the tagline. Today it sits at the bottom.

## Part 2: case studies as stories (six featured projects)

**Data** (`PodSchema`): a new optional `story` field:

```ts
story?: {
  situation: { en; id };                     // 2 to 4 sentences, first person allowed (body text)
  decisions: { title: { en; id }; why: { en; id } }[]; // 2 to 4
  lesson?: { en; id };                       // owner-approved only; section hidden when absent
}
```

The validator requires `story` only for the slugs below; any other pod may add it later. `problem` and `approach` stay in the data, because the 3D room views and the Ask pack still use them.

**Projects:** `voice-ai-contact-center`, `ai-code-security-platform`, `ai-solutions-assistant`, `fraud-review-platform`, `digital-banking-integrations`, `fabric-forecasting-dashboard`.

**Page** (`src/app/[locale]/labs/[slug]/page.tsx`): when `pod.story` exists, the body reads:
1. **Situation**: replaces Problem.
2. **Role and key decisions**: a numbered list (`01`, `02`, ...). Each decision is a title plus a "Why" line. This replaces the Contribution list.
3. **Results**: the existing `MetricLedger`, now after the decisions.
4. **Lesson**: one quote-styled paragraph with a single hairline left rule, not a colored stripe; only when present.
5. Then architecture, gallery, code and research, stack (unchanged).

The header and metric strip are unchanged. `CaseToc` lists the story chapters. Pods without `story` keep today's layout exactly.

**Content sourcing:**
- **Situation and decisions:** drafted from each pod's existing `problem`, `approach` and `results`, plus the career-intelligence evidence (read-only, `_brief/corrections.md` binding). Every claim must already exist in the dataset or the evidence base; no new numbers.
- **Lessons:** drafted only from the owner's own words: `content/blog/*.mdx`, `content/perspectives.json`, and the career-intelligence notes. Each draft carries its source. The owner approves or edits all six before merge.

## Part 3: 404 and empty states

**404** (`src/app/global-not-found.tsx`, static, bilingual on one page because the URL may lack a locale):
- **Content:**
  - the Rover mark, with a gentle wobble that stops under reduced motion;
  - the kicker "404 · Off the map";
  - the title "Rover took a wrong turn", with one Indonesian line under it;
  - three path cards: **View the CV** (primary, `/en/cv`), See the work (`/en/labs`), and Home (`/en` and `/id`).
- **"Did you mean...?":** one external script, `public/not-found.js` (CSP-safe under `script-src 'self'`, no inline code, loaded with `defer`).
  - It reads a build-time `public/data/routes.json`, generated from `allPagePaths()` (`src/lib/routes.ts`) for both locales.
  - It shows the closest path: a missing locale prefix is added, and the last segment is matched by edit distance, with a threshold so a far-off match shows nothing. The suggestion shows the page title.
  - Without JavaScript, only the suggestion is missing.
  - The route file is small: about 95 paths per locale, with titles, well under 10 KB.

**Empty and offline states** (`messages/en.json`, `messages/id.json`; copy only, same keys where possible). Every state names one next step:

| State | New copy (EN) |
|---|---|
| Ask offline | Rover is resting for a moment. Meanwhile, the CV and selected work answer most questions. |
| Stats unavailable | Visitor numbers are refreshing. Check back in a minute. |
| Office offline | The live office is quiet right now. See what shipped recently in Writing and Work. |
| No public activity | Nothing public yet today. |
| Project filter empty | No projects match these filters. Clear filters or ask Rover what you're looking for. |
| Room details failed | This room didn't load. Open the full page instead. |

Links inside these strings become rich-text tags in `next-intl` (no raw HTML). The "Agents start work during WIB hours" idea from the mockup is dropped because it is a schedule claim.

## Testing

- **Content:**
  - `heroProof` ids exist and number exactly 3, and each has `short`;
  - the six slugs carry `story` with 2 to 4 decisions;
  - no em dash or first person in headings;
  - bilingual parity;
  - `validate:content` passes.
- **Unit:** the did-you-mean matcher covers a locale missing, a slug typo, a trailing slash, an exact page, and a far-off path with no suggestion. The ticker excludes the proof ids.
- **E2E** (`e2e/pageview.spec.ts` and a new 404 spec):
  - View CV is the primary hero button and opens the reader;
  - the proof strip shows three values;
  - the section order is as listed;
  - a story case study shows Situation, then Decisions, then Results, then Lesson, and a non-story pod is unchanged;
  - the 404 shows the three paths and, with JavaScript, a suggestion for `/en/labs/voice-ai-contact-centre`;
  - axe passes on the home, a story page and the 404.
- **Lighthouse:** `/en`, `/id` and `/en/labs/voice-ai-contact-center` stay inside their budgets.

## Docs and rollout

- **Docs updated in the same PR:**
  - `docs/agents/page-view.md` (hero, order, story chapters, 404);
  - `docs/agents/content.md` (`heroProof`, `stat.short`, `pod.story`);
  - `docs/content.md` (how to write a story and a lesson);
  - `docs/features.md`;
  - a decision file `docs/decisions/2026-10-25-classic-recruiter-pass.md`.
- **Delivery:** one PR, in three commits (landing, stories, 404 and empty states). The six lessons are sent to the owner for approval before merge; any lesson not approved ships hidden (the field is optional).
