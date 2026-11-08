# Benchmark Article and Reading Navigation Implementation Plan

> **For agentic workers:** Use `subagent-driven-development` for bounded implementation lanes or `executing-plans` for serial execution. Track tasks in the session SQL database, not Markdown checkboxes. Repository work belongs in a fresh isolated coding session.

**Goal:** Enrich the bilingual ten-day benchmark retrospective with confidentiality-safe later lessons and ship the owner-selected B contents panel across blog articles and case studies.

**Architecture:** Keep the original retrospective as the historical record and add one later-lessons section in each translation. Reuse `CaseToc` for both page families, with one navigation landmark, CSS-selected desktop and native-disclosure branches, unchanged fragment targets and scroll-spy. Existing source-date and Ask-generation paths remain authoritative.

**Tech Stack:** Existing Next.js static export, React, TypeScript, Bun, next-intl, MDX, token-based CSS, Vitest, Playwright and Lighthouse CI. No dependency or runtime changes.

Status: in review

## Global Constraints

- Approved specification: coordinating session `files/benchmark-and-reader-design.md`, approved 8 November 2026.
- Inspected and freshly confirmed main: `3cfbe6c8ed6097686030f63d27090ef52eace81d`. If execution starts on newer main, read its root rules and reconcile the touched surfaces first.
- Read root `AGENTS.md` and `CLAUDE.md`, then the relevant current content, styling, reader, Ask and performance rules before edits.
- Primary checkouts are read-only. Do not edit, build, test or install in them. Do not restore or reuse archived sessions.
- Prefer `rtk` for Git. Use native Git only when necessary for exact output or repository scripts.
- No commits, pushes, PRs, merges, production pack publication or deployment without separate explicit owner authorization. Plan approval permits local implementation and verification, not publication.
- Never publish private client or repository names, identifiers, URLs, task names, reconstructable mechanisms, hidden tests, private artifacts, reviewer identities or quotations, individual scores or model-by-task results.
- Keep the original post title, slug, publication date `2026-11-02`, first-ten-days sample and five-merged-at-publication statement. Later evidence is a separate population.
- Later work included hard-rated tasks. Do not describe all later tasks as very hard, or approval as merge.
- Both languages carry equivalent facts, written naturally rather than translated mechanically.
- No em dashes. No first person in post titles, taglines or share titles; first-person body prose remains.
- Keep existing heading labels and IDs, the two benchmark diagrams, links, protected Sun/Moon sources, case-study factual bodies, CV, papers, published guides and 3D content unchanged.
- Keep blog head/body/end centred at 38rem. Keep existing case-study content columns. Desktop contents start at 1280 px.
- Preserve existing fonts and colour tokens. No new colour literals, blur, coloured edge stripes, glow pill, modal or floating phone control.
- Touch targets are at least 44 CSS px. Full labels, native focus and anchors, no-JavaScript operation, reduced motion and quiet availability remain.
- No new unit-test cases or files. Adapt existing assertions to intentional markup and date changes without weakening them; use browser coverage for new responsive behaviour.
- No new dependencies, retrieval algorithms, prompt changes, client namespace expansion, unrelated refactors or budget increases.
- Current caps: CSS 20,480 B, HTML 83,968 B, JavaScript 245,760 B and fonts 61,440 B. Blocking Lighthouse medians remain LCP 2 s, CLS 0.01 and TBT 200 ms.
- Ask caps: text 384 KiB, stored value 768 KiB, fallback 24 KiB. Refresh the existing embedding cache; do not accept missing vectors as completion.
- Serialize builds, tests, embedding requests and browser measurements. Two writers may edit disjoint surfaces in parallel; freeze both lanes before integrated validation.

## File Map and Ownership

| File | Owner and responsibility |
|---|---|
| `content/blog/ten-very-hard-benchmark-tasks-in-ten-days.en.mdx` | Article lane: later lessons, historical-tense corrections and truthful `updated` |
| `content/blog/ten-very-hard-benchmark-tasks-in-ten-days.id.mdx` | Article lane: independent Indonesian writing with equivalent facts |
| `content/site-content.json` | Article lane only if an excerpt adjustment becomes necessary; otherwise unchanged |
| `src/components/page/CaseToc.tsx` | Navigation lane: shared markup, numbered links, current state and desktop-only figure avoidance |
| `src/app/[locale]/blog/[slug]/page.tsx` | Navigation lane: contents before body in source order, localized count, same reading measure |
| `src/app/[locale]/labs/[slug]/page.tsx` | Navigation lane: contents before chapters, same desktop columns and original `toc` array |
| `src/app/pageview.css` | Navigation lane: B appearance, disclosure, bounded desktop list and responsive placements |
| `messages/en.json`, `messages/id.json` | Navigation lane: `case.chapterCount`, resolved on the server |
| `tests/hud/CaseToc.test.tsx` | Navigation lane: adapt the two existing cases to mirrored lists and the count prop |
| `e2e/pageview.spec.ts` | Navigation lane: existing selector repairs and new responsive/no-JS browser contracts |
| `tests/unit/seo.test.ts` | Integrator: adapt existing publication-date-only expectations to actual source modification dates |
| `tests/ask/golden.json` | Integrator: reconcile existing historical benchmark fixtures only if source wording requires it |
| `content/generated/ask-embeddings.json` | Integrator: refresh changed public chunks and remove stale entries using existing script |
| `functions/_generated/` | Existing build output, ignored; never hand-edit or commit |
| `e2e/pageview-visual.spec.ts` | Integrator: bounded opt-in before/after reader captures |
| `DESIGN.md`, `docs/agents/page-view.md`, `docs/agents/styling-and-i18n.md` | Integrator: document B as the approved contents-specific treatment |
| `docs/agents/content-style-and-safety.md`, `docs/features.md` | Integrator: current editorial boundary and reader feature behaviour |
| `docs/decisions/2026-11-08-benchmark-and-reading-navigation.md` | Integrator: dated public-safe owner decision, no PR line before one exists |
| `docs/superpowers/specs/2026-11-08-benchmark-and-reader-design.md` | Copy of approved sanitized design during authorized implementation |
| `docs/superpowers/plans/2026-11-08-benchmark-and-reader-plan.md` | Copy of this plan during authorized implementation, own `Status:` line |

Do not change `src/content/blog.ts`, `src/lib/feed.ts`, `src/lib/jsonld.ts`, `src/lib/routes.ts`, the heading compiler or the Ask retrieval pipeline merely to implement this plan. Their existing behaviour already covers the required source dates and indexing.

## Execution and Baseline

After plan approval, the Project discovers the configured HQ container and starts one fresh isolated coding session. Pass the original request and these sanitized artifacts. Do not pass raw private PR output.

The coding session records a shared baseline before starting the writers:

1. Read current rules and inspect the isolated worktree. Preserve any unrelated changes.
2. Confirm tools and source state:

   ```bash
   rtk git status --short
   rtk git rev-parse HEAD
   bun --version
   bun run test -- tests/hud/CaseToc.test.tsx tests/content/blog-mdx.test.tsx tests/unit/seo.test.ts tests/ask/golden-facts.test.ts
   ```

   Expected: original contracts pass. If a dependency is missing, restore from the committed lockfile only after that failure. Do not upgrade packages.

3. Add the opt-in capture block from Task 4 before application edits, then run one baseline build and capture the original reading pages. Test-only capture changes do not alter the built application:

   ```bash
   bun run build
   READER_SHOTS=before SCREENSHOTS=1 E2E_PORT=4186 bunx playwright test e2e/pageview-visual.spec.ts -g "Reader review" --workers=1
   ```

   Check the test port is unused first. Use another free port consistently if necessary. Never attach to or stop another user's server.

4. Record the original nine h2 IDs per benchmark translation and baseline size results. Baseline capture includes the existing phone layout, which has no inline contents disclosure.
5. Start at most two bounded writers: one owns both translations; one owns the shared navigation surfaces. The integrator owns generated content, metadata expectations, documentation and final review.

## Task 1: Bilingual Later Lessons

**Interfaces**

- Consumes the existing public post, original first-ten-days facts and the approved sanitized lesson set.
- Produces the same slug, titles, publication date and original nine h2s, plus one new h2 and four h3 lessons per translation.
- `updated` remains a quoted day accepted by `frontmatterUpdated(source: string): string | undefined`.
- Existing `postUpdated(post: { slug: string; date: string }, locale: Locale): string | undefined` continues to supply all modification metadata.

### Step 1: Protect the Historical Source

Inspect the two translations together. Keep the opening's original ten submissions and five merged at publication. Keep all original h2 lines unchanged, including:

- English insertion point: `## What I would keep and change`.
- Indonesian insertion point: `## Yang Akan Saya Pertahankan dan Ubah`.

The English opening already says "By the time I published this article". Give the Indonesian opening the same explicit historical frame, without dropping the quoted half-merged fact:

```md
Dalam sepuluh hari pertama, saya mengajukan sepuluh task lewat pull request. Saat artikel ini pertama kali diterbitkan, hasilnya masih seperti ini. Separuhnya sudah di-merge, dan sebagian besar masuk kategori sangat sulit (very hard), level kesulitan teratas.
```

Keep the current excerpt and registry untouched initially. They describe the original sprint and are still truthful. The existing page derives reading time from `readingMinutes(found.source)`, not the frontmatter's static `readingTime`; do not hard-code a new number.

### Step 2: Add the English Section

Insert the following section before the English reflection. This is public-safe draft copy, not permission to import private task details. The evidence snapshot is explicitly 8 November 2026, independently of the eventual significant-edit date.

```md
## After the first ten days

These notes come from later reviews, as of 8 November 2026, not the original ten-day window. Later work included hard-rated tasks, so the title's very-hard label does not apply to everything that followed. Some work was still open on that date. Review approval was not the same as a merge.

### Verify dependencies against the evidence

I learned to separate a tool producing an answer from evidence that the answer was correct. An installed dependency can return a plausible result while behaving differently from what the task requires. Familiarity with its API is not enough; the result needs an independent check.

The failure description matters too. Some agents noticed an inconsistency but still delivered a program that retained the wrong behaviour. That is a failure to finish a repair, not evidence that the agent never inspected the tool. The distinction changes what I should test next.

### Test the grader itself

A correct answer can have more than one valid representation. A grader should accept equivalent output while enforcing the required schema, values and any stated ordering. Rejecting the correct result for the wrong reason measures the grader's assumptions, not the agent's ability.

The reverse mistake is accepting a report because the same program reproduces it on another run. A consistently wrong program can agree with itself. Repeatability is useful evidence about execution, but correctness still needs an expected result that does not come from the program being graded.

### Make the repair survive fresh inputs

A patch that fixes the visible example is weaker than a program that handles another legitimate input. I need to check the delivered output and rerun the delivered program, using independently established expected results for both.

Fresh inputs help distinguish a general repair from a workaround tied to the first environment. Reruns can expose state left behind by earlier execution, but a clean rerun alone is not proof of correctness. The question is whether the intended behaviour holds beyond the example that prompted the fix.

### Keep claims within the evidence

Successful checks on covered inputs do not establish that an entire input family works. I need to say what was observed, what remained untested, and what the delivered program actually did.

That discipline also applies to difficulty and completion. A later task's result does not revise the first sprint's result, and an approved open contribution is still open. The stronger retrospective is not the one with the broadest claims. It is the one whose claims a reader could check, without being given the private task.
```

Keep the section close to the approved 350 to 500 English-word range. Editing for voice is allowed; expanding the identifying scenarios or adding unsupported results is not.

### Step 3: Add the Indonesian Section

Insert before the Indonesian reflection. Preserve the same date, difficulty distinction, open-versus-merged caveat and four lessons.

```md
## Setelah Sepuluh Hari Pertama

Catatan ini berasal dari review lanjutan hingga 8 November 2026, bukan dari periode sepuluh hari pertama. Pekerjaan berikutnya juga mencakup task berkategori hard, jadi label very hard pada judul tidak berlaku untuk semua pekerjaan setelahnya. Pada tanggal itu, masih ada pekerjaan yang belum merged. Approval dalam review belum berarti merge.

### Periksa Dependency dengan Bukti

Saya belajar membedakan tool yang menghasilkan jawaban dari bukti bahwa jawabannya benar. Dependency yang sudah terpasang bisa mengeluarkan hasil yang tampak masuk akal, tetapi perilakunya tidak sesuai dengan kebutuhan task. Mengenal API-nya saja tidak cukup; hasilnya tetap perlu pemeriksaan independen.

Cara menjelaskan kegagalannya juga penting. Ada agent yang menemukan ketidaksesuaian, tetapi program yang akhirnya diserahkan masih mempertahankan perilaku yang salah. Itu kegagalan menuntaskan perbaikan, bukan bukti bahwa agent tidak pernah memeriksa tool. Perbedaan ini menentukan pemeriksaan berikutnya.

### Uji Grader-nya Juga

Jawaban yang benar bisa memiliki lebih dari satu representasi yang sah. Grader perlu menerima hasil yang setara, sambil tetap menegakkan schema, nilai, dan urutan yang memang diwajibkan. Menolak hasil yang benar karena asumsi format yang keliru justru mengukur asumsi grader, bukan kemampuan agent.

Kesalahan sebaliknya adalah menerima laporan hanya karena program yang sama bisa menghasilkan ulang laporan itu. Program yang selalu salah pun dapat konsisten dengan dirinya sendiri. Repeatability memberi informasi tentang eksekusi, tetapi kebenaran tetap membutuhkan hasil acuan yang tidak berasal dari program yang sedang dinilai.

### Pastikan Perbaikan Bertahan pada Input Baru

Patch yang memperbaiki contoh awal belum sekuat program yang juga menangani input lain yang sah. Saya perlu memeriksa hasil yang diserahkan dan menjalankan ulang programnya, memakai hasil acuan yang ditentukan secara independen untuk keduanya.

Input baru membantu membedakan perbaikan umum dari workaround yang hanya cocok dengan lingkungan pertama. Run ulang bisa memperlihatkan state yang tertinggal dari eksekusi sebelumnya, tetapi run yang bersih saja belum membuktikan kebenaran. Yang perlu dipastikan adalah perilaku yang diminta tetap berlaku di luar contoh yang memicu perbaikan.

### Batasi Klaim pada Bukti yang Ada

Lulus pada input yang sudah diperiksa tidak berarti seluruh kelompok input pasti bekerja. Saya perlu menjelaskan apa yang benar-benar diamati, apa yang belum diuji, dan apa yang dilakukan program yang diserahkan.

Disiplin yang sama berlaku untuk kesulitan dan penyelesaian. Hasil task berikutnya tidak mengubah hasil periode pertama, dan kontribusi yang sudah mendapat approval tetapi masih open tetap belum merged. Retrospektif yang lebih kuat bukan yang klaimnya paling luas, melainkan yang klaimnya bisa diperiksa tanpa membocorkan task privat.
```

### Step 4: Reconcile the Reflection and Dates

Replace the stale current-status closing bullets with historical wording:

```md
- **An approval is not a merge.** At publication, half of the first ten submissions were still waiting for review, and a review could still close them.
```

```md
- **Approval belum tentu berarti merge.** Saat artikel pertama kali diterbitkan, separuh dari sepuluh pengajuan awal masih menunggu review, dan review masih bisa menutupnya.
```

Add one small checklist entry in each language, preserving the existing entries and renumbering normally:

```md
Check the grader and the dependency against independent expected results.
```

```md
Periksa grader dan dependency terhadap hasil acuan yang independen.
```

Add frontmatter `updated` to both translations using the actual significant-edit day. For an edit on 8 November this is:

```yaml
date: "2026-11-02"
updated: "2026-11-08"
```

If execution happens later, use that later actual edit day for `updated`, while the body still accurately identifies the checked evidence snapshot as 8 November. Do not set the publication date to the revision day.

Keep first-ten-days workflow statements inside their historical frame. Change tense only where the new section would otherwise make the original human gates read as universal claims about later work.

### Step 5: Review the Source Diff

After both lanes freeze, run:

```bash
bun run validate:content
bun run test -- tests/content/blog-mdx.test.tsx tests/ask/golden-facts.test.ts tests/unit/seo-copy.test.ts
rtk git diff -- content/blog/ten-very-hard-benchmark-tasks-in-ten-days.en.mdx content/blog/ten-very-hard-benchmark-tasks-in-ten-days.id.mdx content/site-content.json
```

Expected: both translations compile, each has ten h2s, old anchors remain, titles/excerpts/dates stay aligned and safety checks pass. Review for reconstructable private details manually; a name blacklist alone is not adequate.

## Task 2: Shared B Navigation and Responsive Placement

**Interfaces**

```ts
type CaseTocProps = {
  items: readonly { id: string; label: string }[];
  label: string;
  countLabel: string;
  avoid?: string;
  children?: ReactNode;
};
```

- Produces the existing exported `CaseToc` with a required server-resolved `countLabel`.
- `items`, label text, real `href` fragments, `aria-current="true"` and root `data-covered` stay intact.
- Root remains one `<nav aria-label={label}>`; no list or link gets duplicate IDs.
- New CSS surfaces: `.pv-toc-wide`, `.pv-toc-disclosure`, `.pv-toc-head`, `.pv-toc-count`, `.pv-toc-list`, `.pv-toc-number`, `.pv-case-toc`, `.pv-case-body`.
- `children` is rendered once outside the mirrored lists. Existing production callers do not supply it; do not duplicate arbitrary child trees.

### Step 1: Establish the Browser Contract

Add the responsive browser tests in the final contract section before application edits. Keep them in `e2e/pageview.spec.ts`, not a new unit file.

The tests should fail on the baseline because phones have no native contents, desktop rows have no numbers/count, and the long rail is unbounded. The existing centered-column, no-JS anchors, wide-diagram and phone-header checks remain.

### Step 2: Replace the Shared Component Coherently

Use this implementation shape in `src/components/page/CaseToc.tsx`. It retains the current geometry-based heading selection; do not replace it with observer-entry order or add a page-scroll listener.

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

function stuckTop(el: HTMLElement): number {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.position === "sticky") return parseFloat(style.top) || 0;
  }
  return el.getBoundingClientRect().top;
}

type CaseTocProps = {
  items: readonly { id: string; label: string }[];
  label: string;
  countLabel: string;
  avoid?: string;
  children?: ReactNode;
};

export function CaseToc({ items, label, countLabel, avoid, children }: CaseTocProps) {
  const [active, setActive] = useState<string | null>(null);
  const [covered, setCovered] = useState(false);
  const nav = useRef<HTMLElement>(null);
  const ids = items.map((item) => item.id).join(" ");

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const targets = ids.split(" ").flatMap((id) => document.getElementById(id) ?? []);
    const pick = () => {
      const line = window.innerHeight * 0.4;
      let current: string | null = null;
      for (const target of targets) {
        if (target.getBoundingClientRect().top <= line) current = target.id;
      }
      setActive(current);
    };
    const observer = new IntersectionObserver(pick, { rootMargin: "0px 0px -60% 0px" });
    for (const target of targets) observer.observe(target);
    return () => observer.disconnect();
  }, [ids]);

  useEffect(() => {
    const list = nav.current;
    const targets = avoid ? [...document.querySelectorAll(avoid)] : [];
    if (!list || targets.length === 0 || typeof IntersectionObserver === "undefined") return;

    const desktop = window.matchMedia("(min-width: 80rem)");
    const crossing = new Set<Element>();
    let observer: IntersectionObserver | null = null;
    const watch = () => {
      observer?.disconnect();
      crossing.clear();
      setCovered(false);
      if (!desktop.matches) return;

      const top = stuckTop(list);
      const bottom = Math.max(0, window.innerHeight - top - list.offsetHeight);
      observer = new IntersectionObserver(
        (entries) => {
          const left = list.getBoundingClientRect().left;
          for (const entry of entries) {
            if (entry.isIntersecting && entry.boundingClientRect.right > left) {
              crossing.add(entry.target);
            } else {
              crossing.delete(entry.target);
            }
          }
          setCovered(crossing.size > 0);
        },
        { rootMargin: `-${top}px 0px -${bottom}px 0px` },
      );
      for (const target of targets) observer.observe(target);
    };
    const resize = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(watch);
    watch();
    resize?.observe(list);
    desktop.addEventListener("change", watch);
    window.addEventListener("resize", watch);
    return () => {
      desktop.removeEventListener("change", watch);
      window.removeEventListener("resize", watch);
      resize?.disconnect();
      observer?.disconnect();
    };
  }, [avoid, ids]);

  const links = (
    <ol>
      {items.map((item, index) => (
        <li key={item.id}>
          <a href={`#${item.id}`} aria-current={active === item.id ? "true" : undefined}>
            <span className="pv-toc-number" aria-hidden="true">{index + 1}</span>
            <span>{item.label}</span>
          </a>
        </li>
      ))}
    </ol>
  );

  return (
    <nav ref={nav} aria-label={label} className="pv-toc" data-covered={covered ? "" : undefined}>
      <div className="pv-toc-wide">
        <div className="pv-toc-head">
          <p className="pv-meta">{label}</p>
          <span className="pv-toc-count">{countLabel}</span>
        </div>
        <div className="pv-toc-list">{links}</div>
      </div>
      <details className="pv-toc-disclosure">
        <summary>
          {label}
          <span className="pv-toc-count">{countLabel}</span>
        </summary>
        <div className="pv-toc-list">{links}</div>
      </details>
      {children}
    </nav>
  );
}
```

Native `details` has no `open` attribute initially and no click handler. Do not set it closed on hydration, force it open with desktop CSS, auto-close it after a link or steal focus. The hidden desktop branch is selected with `display: none`, not offscreen positioning.

`ResizeObserver` accounts for real panel height changes. Resize/matchMedia fallbacks remain when it is absent. Figure hiding is inactive below desktop, while heading scroll-spy still works.

### Step 3: Wire Both Server Callers and Labels

Add one key to each existing `case` namespace:

```json
{
  "chapterCount": "{count, plural, one {# chapter} other {# chapters}}"
}
```

```json
{
  "chapterCount": "{count} bagian"
}
```

Do not add `case` to a client namespace list. The current `case` labels are server-resolved; keep that property.

On the blog page, move its existing aside before the prose and remove the unconditional sticky wrapper:

```tsx
<div className="pv-post-body">
  {headings.length > 1 && (
    <aside className="pv-post-toc" lang={locale}>
      <CaseToc
        key={`${locale}:${slug}`}
        items={headings}
        label={tcase("onThisPage")}
        countLabel={tcase("chapterCount", { count: headings.length })}
        avoid=".arch-break"
      />
    </aside>
  )}
  <div className="prose-hq pv-read">{content}</div>
</div>
```

Do not put `.pv-read` on the aside: the three existing reading measures must remain the only three.

On the case-study page, move the existing aside before the unchanged chapter body:

```tsx
<aside className="pv-case-toc">
  <CaseToc
    key={`${locale}:${pod.slug}`}
    items={toc}
    label={tcase("onThisPage")}
    countLabel={tcase("chapterCount", { count: toc.length })}
  />
</aside>
```

The chapter body's class becomes `pv-col pv-case-body min-w-0 lg:col-span-8`. Its content, `toc` construction, conditionally present Results/Engineering chapters and protected IDs remain unchanged. Remove the old `hidden xl:...` and `sticky top-24 pt-24` wrappers. The CSS below explicitly replaces their placement.

The page-identity key resets observer targets and disclosure state on a new article or case route, including routes that share heading IDs. Updating `ids` also reinitializes figure avoidance when the supplied chapter list changes.

### Step 4: Replace the Contents CSS and Add Responsive Placement

Keep the `.pv-read`, post-title, progress and phone-header rules unchanged. Replace the old glowing contents rules, the hidden-below-desktop `.pv-post-toc` rule and the old contents avoidance block with this token-based shape inside the existing components layer:

```css
.pv-toc {
  border: 1px solid var(--color-line);
  border-radius: var(--radius-card);
  background: var(--color-paper-2);
}

.pv-toc-wide {
  display: none;
}

.pv-toc-head,
.pv-toc-disclosure > summary {
  min-height: 44px;
  padding: var(--space-sm);
  font-size: var(--text-meta);
  line-height: 20px;
}

.pv-toc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-xs);
}

.pv-toc-disclosure > summary {
  cursor: pointer;
}

.pv-toc-disclosure > summary .pv-toc-count {
  float: inline-end;
}

.pv-toc-count {
  color: var(--color-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.pv-toc-list {
  padding: var(--space-xs);
}

.pv-toc a {
  display: grid;
  grid-template-columns: 3ch minmax(0, 1fr);
  align-items: start;
  gap: var(--space-xs);
  min-height: 44px;
  padding: var(--space-xs);
  border-radius: var(--radius-control);
  color: var(--color-muted);
  font-size: var(--text-meta);
  line-height: 1.5;
  overflow-wrap: anywhere;
  transition:
    color var(--dur-micro) var(--ease-standard),
    background-color var(--dur-micro) var(--ease-standard);
  @variant motion-reduce {
    transition: none;
  }
}

.pv-toc-number {
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.pv-toc a:hover {
  color: var(--color-ink);
}

.pv-toc a[aria-current="true"] {
  color: var(--color-ink);
  background: var(--color-surface-2);
}

.pv-post-toc {
  width: 100%;
  max-width: 38rem;
  margin-inline: auto;
  margin-bottom: var(--space-lg);
}

.pv-case-toc {
  grid-column: 1 / -1;
}

@media (min-width: 80rem) {
  .pv-toc-wide {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    max-height: calc(100dvh - var(--nav-h) - var(--space-lg) - var(--space-md) - 2px);
  }

  .pv-toc-wide > .pv-toc-list {
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    scroll-padding-block: var(--space-xs);
  }

  .pv-toc-disclosure {
    display: none;
  }

  .pv-post-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 38rem) minmax(0, 1fr);
    column-gap: var(--gap-columns);
  }

  .pv-post-body > .pv-read {
    grid-column: 2;
    grid-row: 1;
    width: 100%;
  }

  .pv-post-toc,
  .pv-case-toc {
    position: sticky;
    top: calc(var(--nav-h) + var(--space-lg));
    align-self: start;
    justify-self: end;
    width: 100%;
    max-width: 18rem;
    margin: 0;
  }

  .pv-post-toc {
    grid-column: 3;
    grid-row: 1;
  }

  .pv-case-toc {
    grid-column: 10 / span 3;
    grid-row: 1;
  }

  .pv-case-body {
    grid-column: 1 / span 8;
    grid-row: 1;
  }

  .pv-toc {
    transition:
      opacity var(--dur-micro) var(--ease-standard),
      visibility var(--dur-micro);
    @variant motion-reduce {
      transition: none;
    }
  }

  .pv-toc[data-covered]:not(:focus-within) {
    opacity: 0;
    visibility: hidden;
  }
}
```

Retain the native disclosure marker and the existing global instant focus outline. Check focus on both anchors and `summary` in the real browser. If a repo selector excludes summary, extend that selector narrowly rather than introducing a new focus system.

The 18rem value is a maximum, not a fixed rail width: 1280 px gets only the space its gutter actually contains. On short screens, test list bounds after the reader has scrolled into the sticky band, not by assuming the panel begins at its sticky top before the article header scrolls away.

No font-weight change on active rows: avoid introducing wrap-driven layout shifts during scrolling.

### Step 5: Adapt Existing Unit and Browser Selectors

In the existing `Page` unit fixture, pass `countLabel="2 chapters"`. Keep the same two unit cases and observer-count assertion.

The plain-anchor case now verifies both DOM mirrors, while browser tests verify that only one is exposed. Use exact hrefs rather than allowing arbitrary duplication:

```tsx
const nav = screen.getByRole("navigation", { name: "On this page" });
const links = nav.querySelectorAll<HTMLAnchorElement>("a");
expect([...links].map((a) => a.getAttribute("href"))).toEqual([
  "#problem", "#approach", "#problem", "#approach",
]);
expect(nav.querySelector('.pv-toc-wide a[href="#problem"]')).toHaveAccessibleName("Problem");
for (const a of links) expect(a).not.toHaveAttribute("aria-current");
```

For the existing scroll-spy case, assert both copies of each target:

```tsx
const nav = screen.getByRole("navigation", { name: "On this page" });
const current = nav.querySelectorAll('a[href="#approach"]');
const other = nav.querySelectorAll('a[href="#problem"]');
expect(current).toHaveLength(2);
expect(other).toHaveLength(2);
for (const a of current) expect(a).toHaveAttribute("aria-current", "true");
for (const a of other) expect(a).not.toHaveAttribute("aria-current");
expect(nav.querySelector('.pv-toc-wide a[href="#approach"]')).toHaveAccessibleName("What I did");
```

In `e2e/pageview.spec.ts`, use a stable root locator when asserting desktop hiding:

```ts
const contents = (page: Page) =>
  page.getByRole("navigation", { name: en.case.onThisPage, includeHidden: true });
```

Child `getByRole("link")` remains visibility-aware. In the existing edge-accent case, change the raw active-link selector to `.pv-toc a[aria-current='true']:visible` and retain the exact count of one.

Run after both source lanes freeze:

```bash
bun run test -- tests/hud/CaseToc.test.tsx tests/content/blog-mdx.test.tsx
bun run build
E2E_PORT=4186 bunx playwright test e2e/pageview.spec.ts -g "reading a post|Reading contents|case study|Engineering detail|no colored edge stripes" --workers=1
```

Expected: old behaviour and accessible names are still covered, hidden mirrors do not count as duplicate exposed links, the new responsive tests pass, and the fallback uses native anchors.

## Task 3: Metadata Expectations and Derived Ask Content

Wait for both authoring lanes to freeze. This task must run before the final verified build.

### Step 1: Keep Existing Benchmark Golden Facts Historical

Inspect existing golden entries `q20`, `q115` and `q116`. Preserve the title/date and the original ten/five/half-merged scope. Do not change them to current aggregate PR totals or add new cases.

The proposed copy leaves their quoted source facts intact, so no fixture rewrite is necessary unless final prose changes the quoted wording. If that happens, replace only the existing quoted fact with the equivalent actual source sentence; retain the original negative assertions against "all merged".

### Step 2: Adapt Existing Date Assertions

In the existing `tests/unit/seo.test.ts` content-date case, stop assuming every hosted post's lastmod equals publication. Import `frontmatterUpdated` and `getPostSource` from `@/content/blog`.

Derive the expected value independently from the actual source line:

```ts
const post = hostedPosts[0];
const found = getPostSource(post.slug, "en");
if (!found) throw new Error(`Missing source for ${post.slug}`);
const expectedModified = frontmatterUpdated(found.source);
const expected = expectedModified ?? post.date;
expect(lastModified(`/blog/${post.slug}`)).toBe(expected);
const entry = sitemap().find((e) => e.url === `${SITE_URL}/en/blog/${post.slug}`);
expect(entry?.lastModified).toBe(expected);
const json = postJsonLd(post, "en", found.locale);
expect(json.datePublished).toBe(post.date);
if (expectedModified && expectedModified > post.date) {
  expect(json.dateModified).toBe(expectedModified);
} else {
  expect(json).not.toHaveProperty("dateModified");
}
```

Keep the unrelated library/journey/stamp assertions unchanged. These source-date and JSON-LD assertions belong inside the existing content-date case; do not add an `it` block. No production timestamp code needs changing.

### Step 3: Refresh Vectors and Build Artifacts

Run the established scripts in this order:

```bash
bun scripts/ask-embed.ts --dry
bun scripts/ask-embed.ts --cli
bun scripts/ask-embed.ts --check
bun run build:knowledge
bun run test -- tests/ask/pack.test.ts tests/ask/pack-index.test.ts tests/ask/pack-artifacts.test.ts tests/ask/pack-source.test.ts tests/ask/golden-facts.test.ts tests/unit/seo.test.ts tests/unit/seo-copy.test.ts
```

`--cli` uses the already authenticated `cf` CLI and only the sanitized public pack. Normal mode also removes stale vectors. Confirm the final report has zero missing and zero stale entries; `--check` alone rejects missing entries but does not reject stale ones.

If CLI authentication is unavailable, report that blocker and obtain approved credentials through the existing secure workflow. Never copy a token into code, docs, chat or logs. Do not use `--deploy`, whose intentionally permissive fallback is not an acceptable verification gate here.

Only the committed cache is a source change. Do not hand-edit generated JSON, fabricate vectors, change vector dimensions or relax pack caps. Do not publish the KV pack before owner authorization.

## Task 4: Integrated Browser Review, Documentation and Handoff

### Step 1: Browser Contracts

Use the existing imports and helpers in `e2e/pageview.spec.ts`; add `id` messages as a normal JSON import. Preserve `staticTier`, `openPage` and `expectNoSeriousViolations`.

Add the following test family for English/Indonesian, phone/landscape/narrow-tablet widths and both page families:

```ts
import id from "../messages/id.json";

for (const locale of ["en", "id"] as const) {
  const messages = locale === "en" ? en : id;
  for (const route of [
    `/${locale}/blog/ten-very-hard-benchmark-tasks-in-ten-days`,
    `/${locale}/labs/voice-ai-contact-center`,
  ]) {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 844, height: 390 },
      { width: 1279, height: 900 },
    ]) {
      test(`Reading contents: native disclosure ${route} at ${viewport.width}`, async ({ browser }) => {
        const context = await browser.newContext({ viewport, reducedMotion: "reduce" });
        await context.addInitScript(() => {
          localStorage.setItem("hq:terminal-seen", "1");
          localStorage.setItem("hq:onboarded", "done");
        });
        const page = await context.newPage();
        await openPage(page, staticTier(route));
        const nav = page.getByRole("navigation", { name: messages.case.onThisPage });
        const details = nav.locator("details");
        const summary = details.locator("summary");
        await expect(nav).toHaveCount(1);
        await expect(nav.locator(".pv-toc-wide")).toBeHidden();
        await expect(details).not.toHaveAttribute("open");
        await expect(summary).toBeVisible();
        const box = await summary.boundingBox();
        if (!box) throw new Error("Missing contents summary box");
        expect(box.height).toBeGreaterThanOrEqual(44);
        const sourceOrder = await nav.evaluate((el) => {
          const body = document.querySelector(".prose-hq, .pv-case-body");
          if (!body) throw new Error("Missing reading body");
          return Boolean(el.compareDocumentPosition(body) & Node.DOCUMENT_POSITION_FOLLOWING);
        });
        expect(sourceOrder).toBe(true);
        await summary.focus();
        await page.keyboard.press("Enter");
        await expect(details).toHaveAttribute("open", "");
        const links = nav.getByRole("link");
        const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
        const targets = await page.locator(
          route.includes("/blog/") ? ".prose-hq > h2" : ".pv-case-body > section[id]",
        ).evaluateAll((els) => els.map((el) => {
          const heading = el.matches("h2") ? el : el.querySelector("h2");
          if (!heading?.textContent) throw new Error("Missing chapter label");
          return { href: `#${el.id}`, label: heading.textContent };
        }));
        expect(hrefs).toEqual(targets.map((target) => target.href));
        expect(new Set(hrefs).size).toBe(hrefs.length);
        expect(hrefs).not.toContain("#contact");
        for (const [index, target] of targets.entries()) {
          await expect(links.nth(index)).toHaveAccessibleName(target.label);
        }
        for (const height of await links.evaluateAll((as) => as.map((a) => a.getBoundingClientRect().height))) {
          expect(height).toBeGreaterThanOrEqual(44);
        }
        await expect(details.locator(".pv-toc-list")).toHaveCSS("overflow-y", "visible");
        const target = await links.nth(1).getAttribute("href");
        if (!target) throw new Error("Missing chapter fragment");
        await links.nth(1).click();
        await expect(page).toHaveURL(new RegExp(`${target}$`));
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
        await expectNoSeriousViolations(page);
        await page.emulateMedia({ colorScheme: "light" });
        await expectNoSeriousViolations(page);
        await page.emulateMedia({ colorScheme: "dark" });
        await expectNoSeriousViolations(page);
        await context.close();
      });
    }
  }
}
```

Extend the existing centered-blog test, rather than replacing it, to assert:

```ts
expect(ids).toHaveLength(10);
expect(ids).toContain("after-the-first-ten-days");
await expect(contents(page).locator(".pv-toc-count:visible")).toHaveText("10 chapters");
const box = await contents(page).boundingBox();
if (!box) throw new Error("Missing desktop contents box");
expect(box.x).toBeGreaterThanOrEqual(columns[0][0] + columns[0][1]);
expect(box.x + box.width).toBeLessThanOrEqual(1440);
```

Add this complete short-desktop test. Scroll to the third h2 with instant scrolling and wait on the sticky position, not an arbitrary delay:

```ts
test("Reading contents: long list stays reachable on a short desktop", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await openPage(page, staticTier("/en/blog/ten-very-hard-benchmark-tasks-in-ten-days"));
  const nav = page.getByRole("navigation", { name: en.case.onThisPage, includeHidden: true });
  const stickyTop = await page.locator(".pv-post-toc").evaluate((el) => parseFloat(getComputedStyle(el).top));
  await page.locator(".prose-hq > h2").nth(2).evaluate((el) => {
    window.scrollTo({ top: window.scrollY + el.getBoundingClientRect().top - 120, behavior: "instant" });
  });
  await expect.poll(() => nav.evaluate((el) => Math.round(el.getBoundingClientRect().top))).toBe(Math.round(stickyTop));
  const list = nav.locator(".pv-toc-wide > .pv-toc-list");
  await expect(list).toHaveCSS("overflow-y", "auto");
  expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  const box = await nav.boundingBox();
  if (!box) throw new Error("Missing sticky panel box");
  expect(box.y + box.height).toBeLessThanOrEqual(500);
  await list.getByRole("link").last().focus();
  await expect(list.getByRole("link").last()).toBeFocused();
});
```

Test native phone navigation without JavaScript for both locales and page families. The test creates a context with `javaScriptEnabled: false`, uses `page.goto` instead of the hydrated-page helper, opens `summary` with Enter and follows the second exposed link. Assert the fragment, full unique target list and absence of `#contact`.

The implementation test is:

```ts
for (const locale of ["en", "id"] as const) {
  const label = locale === "en" ? en.case.onThisPage : id.case.onThisPage;
  for (const segment of [
    "blog/ten-very-hard-benchmark-tasks-in-ten-days",
    "labs/voice-ai-contact-center",
  ]) {
    test(`Reading contents: no JavaScript ${locale}/${segment}`, async ({ browser }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
        viewport: { width: 390, height: 844 },
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      await page.goto(staticTier(`/${locale}/${segment}`));
      const nav = page.getByRole("navigation", { name: label });
      const details = nav.locator("details");
      await expect(details).not.toHaveAttribute("open");
      await details.locator("summary").focus();
      await page.keyboard.press("Enter");
      await expect(details).toHaveAttribute("open", "");
      const links = nav.getByRole("link");
      const hrefs = await links.evaluateAll((as) => as.map((a) => a.getAttribute("href")));
      const targets = await page.locator(
        segment.startsWith("blog/") ? ".prose-hq > h2" : ".pv-case-body > section[id]",
      ).evaluateAll((els) => els.map((el) => {
        const heading = el.matches("h2") ? el : el.querySelector("h2");
        if (!heading?.textContent) throw new Error("Missing no-script chapter label");
        return { href: `#${el.id}`, label: heading.textContent };
      }));
      expect(hrefs).toEqual(targets.map((target) => target.href));
      expect(new Set(hrefs).size).toBe(hrefs.length);
      expect(hrefs).not.toContain("#contact");
      for (const [index, target] of targets.entries()) {
        await expect(links.nth(index)).toHaveAccessibleName(target.label);
      }
      const target = await links.nth(1).getAttribute("href");
      if (!target) throw new Error("Missing no-script chapter fragment");
      await links.nth(1).click();
      await expect(page).toHaveURL(new RegExp(`${target}$`));
      await context.close();
    });
  }
}
```

In the existing wide-diagram test, use `includeHidden: true` only for the root locator, then keep the exact covered/hidden/visible assertions. Also resize to phone and require an available native summary with no desktop coverage hiding.

For the new article metadata, add one browser test per locale using the actual frontmatter date:

```ts
const slug = "ten-very-hard-benchmark-tasks-in-ten-days";
for (const locale of ["en", "id"] as const) {
  test(`Reading contents: publication and revision metadata ${locale}`, async ({ page }) => {
    const source = readFileSync(`content/blog/${slug}.${locale}.mdx`, "utf8");
    const updated = /^updated:\s*"(\d{4}-\d{2}-\d{2})"\s*$/m.exec(source)?.[1];
    if (!updated) throw new Error("Benchmark revision date missing");
    await openPage(page, staticTier(`/${locale}/blog/${slug}`));
    await expect(page.locator("article > header time")).toHaveCount(2);
    await expect(page.locator("article > header time").first()).toHaveAttribute("datetime", "2026-11-02");
    await expect(page.locator("article > header time").last()).toHaveAttribute("datetime", updated);
    await expect(page.locator('meta[property="article:modified_time"]')).toHaveAttribute("content", updated);
    const response = await page.request.get(`/${locale}/feed.xml`);
    expect(response.ok()).toBe(true);
    const dates = await page.evaluate(({ xml, slug }) => {
      const ns = "http://www.w3.org/2005/Atom";
      const doc = new DOMParser().parseFromString(xml, "application/xml");
      if (doc.querySelector("parsererror")) throw new Error("Invalid Atom XML");
      const entry = [...doc.getElementsByTagNameNS(ns, "entry")].find((e) =>
        e.getElementsByTagNameNS(ns, "id")[0]?.textContent?.endsWith(`/blog/${slug}`),
      );
      if (!entry) throw new Error("Missing benchmark Atom entry");
      return [
        entry.getElementsByTagNameNS(ns, "published")[0]?.textContent,
        entry.getElementsByTagNameNS(ns, "updated")[0]?.textContent,
      ];
    }, { xml: await response.text(), slug });
    expect(dates).toEqual(["2026-11-02T00:00:00Z", `${updated}T00:00:00Z`]);
  });
}
```

Also review a plain non-story case study and the protected Sun/Moon post using the existing browser templates. Compare protected source hashes/diffs, not just screenshots. At 1280 and 1440, check the old case content widths against baseline; both grid rows must stay aligned.

Exercise both system colour-scheme preferences using the existing palette behaviour. Do not add a theme system or invent a light palette to satisfy this review.

### Step 2: Bounded Opt-In Before/After Captures

Add this small capture family to `e2e/pageview-visual.spec.ts`, using its existing screenshot opt-in. It may be introduced before application edits for the baseline:

```ts
const readerLabel = process.env.READER_SHOTS;
for (const locale of ["en", "id"] as const) {
  for (const item of [
    { name: "benchmark", segment: "blog/ten-very-hard-benchmark-tasks-in-ten-days" },
    { name: "case", segment: "labs/voice-ai-contact-center" },
  ]) {
    for (const viewport of [
      { width: 1440, height: 900 },
      { width: 390, height: 844 },
    ]) {
      test(`Reader review ${locale} ${item.name} ${viewport.width}`, async ({ browser }) => {
        test.skip(!readerLabel, "Set READER_SHOTS=before or after");
        const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: "reduce" });
        await context.addInitScript(() => {
          localStorage.setItem("hq:terminal-seen", "1");
          localStorage.setItem("hq:onboarded", "done");
        });
        const page = await context.newPage();
        await page.goto(`/${locale}/${item.segment}?tier=static`, { waitUntil: "networkidle" });
        await page.evaluate(() => document.fonts.ready);
        await page.screenshot({
          path: `screenshots/reader/${readerLabel}/${locale}-${item.name}-${viewport.width}.png`,
          animations: "disabled",
        });
        if (readerLabel === "after" && viewport.width < 1280) {
          await page.locator(".pv-toc-disclosure > summary").click();
          await page.screenshot({
            path: `screenshots/reader/after/${locale}-${item.name}-${viewport.width}-expanded.png`,
            animations: "disabled",
          });
        }
        await context.close();
      });
    }
  }
}
```

Compare the like-for-like collapsed fold captures; expanded mobile shots are additional evidence, not falsely matched to a nonexistent baseline disclosure. Inspect actual images for long labels, native markers, row rhythm, count localization, panel contrast and the unchanged reading column.

Keep screenshots out of source commits. Copy review outputs into the coding session's artifact area and return their real relative paths for typed publication.

### Step 3: Update Current Documentation

Use the following current-state description in `docs/agents/page-view.md` and the matching reader bullet in `docs/features.md`, adapted only for their formatting:

```md
Blog articles and case studies share a neutral numbered contents panel with a localized chapter count. From 1280 px it is sticky in the right gutter, with a bounded list that scrolls when needed. Below that breakpoint, a collapsed native contents disclosure appears before the body and works without JavaScript. The current row uses a restrained neutral fill, not a glowing outline. Existing fragment IDs, keyboard focus, centred blog measure and case-study content columns remain. Wide-diagram avoidance applies only to the desktop rail; focus keeps it visible.
```

In `DESIGN.md` and `docs/agents/styling-and-i18n.md`, record the contents-specific exception to the old current-row glow: neutral frame and filled active row, no decorative dot or edge stripe, unchanged global focus outline. Do not change the rest of the site's interaction system.

In `docs/agents/content-style-and-safety.md`, record that later benchmark evidence is dated, generalized and separated from the original ten-day population, with no reconstructable private mechanism or approved-as-merged claim.

Create the decision file using the existing format and existing Content area:

```md
# Content: Benchmark and reading navigation

- Date: 2026-11-08

The owner keeps the original ten-day benchmark retrospective and adds a distinct later-lessons section in English and Indonesian, publishing the method without identifying private tasks. All blog articles and case studies use contents direction B: a neutral numbered desktop panel and native collapsed narrow-screen disclosure, preserving full labels, old anchors, no-JavaScript navigation, existing reading layouts and current budgets.
```

Do not add a fake PR line, edit `docs/decisions.md`, generate a plans table or update unrelated status rows. Copy the approved sanitized spec and plan into their dated repository paths only inside the authorized coding session.

### Step 4: Final Gates and Performance

Run one serial final gate sequence after the cache and documentation settle:

```bash
bun scripts/ask-embed.ts --check
bun run validate:content
bun run verify:quick
bun run e2e:changed -- --dry
E2E_PORT=4186 bun run e2e:changed -- --workers=1
READER_SHOTS=after SCREENSHOTS=1 E2E_PORT=4186 bunx playwright test e2e/pageview-visual.spec.ts -g "Reader review" --workers=1
```

Confirm the changed-spec plan includes the affected page-view and Ask contracts. Do not use `--pass-with-no-tests` manually to turn a missing selector into success.

Run targeted Lighthouse with the repository's pinned tool and unmodified assertions. Use its existing warm-up, the home page and both revised article locales plus both representative case locales:

```bash
bunx --no-install @lhci/cli@0.15.1 autorun \
  --config=lighthouserc.json \
  --collect.url="http://127.0.0.1:4320/en?lhci-warmup=1" \
  --collect.url="http://127.0.0.1:4320/en" \
  --collect.url="http://127.0.0.1:4320/en/blog/ten-very-hard-benchmark-tasks-in-ten-days" \
  --collect.url="http://127.0.0.1:4320/id/blog/ten-very-hard-benchmark-tasks-in-ten-days" \
  --collect.url="http://127.0.0.1:4320/en/labs/voice-ai-contact-center" \
  --collect.url="http://127.0.0.1:4320/id/labs/voice-ai-contact-center"
```

If that fails specifically because the tool is missing, retry with the same pinned `bunx @lhci/cli@0.15.1` command without `--no-install`. This is the existing CI tool, not a new manifest dependency. If Chrome is missing, use the already installed Playwright Chromium executable through `CHROME_PATH`; do not install another browser before a missing-browser failure.

Run no parallel Chrome or build workload during Lighthouse. Keep medians over three runs and filesystem-only reports. If any cap fails, reduce this change's CSS/markup/JS cost and rerun; do not raise limits, drop assertions or report an unverified pass.

Existing build chunk checks preserve the Classic/3D boundary. No new 3D perf sweep is needed unless the eventual diff unexpectedly changes 3D imports or rendering; that would be a scope exception to bring back to the owner.

### Step 5: Local Review Handoff

Review the whole diff for unrelated changes, historical scope, bilingual parity, protected sources and privacy. Preserve unexpected unrelated changes rather than reverting them.

Provide:

- A concise editorial comparison showing what was added and what historical facts remained.
- Real before/after images for representative desktop and phone readers, plus an expanded native phone disclosure.
- A ready local browser page for the revised article and one case study, using a dedicated free port.
- Exact gate results, measured budget deltas and any genuine blocker, reported privately to the Project.

Use detached mode only for a preview service that must stay available for owner review, with readiness checked by HTTP and browser loading. Stop bounded test helpers after their checks. Stop any service when its dependent review is finished, using its exact recorded handle.

Return a local, verified diff. No publication has been authorized. If the owner later authorizes a PR, re-read current main, follow the repository's push/CI policy and request merge authorization separately; those actions are not part of this local implementation plan.

## Dependency and Acceptance Map

| Deliverable | Prerequisite | Acceptance evidence |
|---|---|---|
| Isolated baseline and captures | Implementation-plan approval | Root rules, original contracts, baseline source IDs and same-state images |
| Bilingual article | Baseline | One new h2 per translation, same historical sample, safe later lessons, real revision day |
| Shared B navigation | Baseline | Existing unit cases plus real responsive, keyboard, no-JS, wide-figure and layout checks |
| Ask cache and date expectations | Both source lanes frozen | Zero missing/stale vectors, pack caps, unchanged golden historical facts, actual source dates |
| Integrated documentation and local review | Article, navigation and derived content | Existing full quick checks, changed browser suite, targeted Lighthouse and inspected before/after output |

The final result is complete only when all approved behaviour is implemented, persisted in the isolated session and verified. An idle writer, green compile alone or partial screenshots are not completion.
