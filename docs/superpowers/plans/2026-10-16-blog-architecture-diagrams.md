# Blog Architecture Diagrams Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every technical blog post shows a clear architecture section: the case-study diagram of the system it describes (or a post-specific workflow diagram), with a numbered walkthrough of the flow that matters to the story, in EN and ID.

**Architecture:** One MDX tag, `<Architecture pod="..." | diagram="..." caption="..." />`, bound per page in `src/app/[locale]/blog/[slug]/page.tsx`. It resolves either a pod's `architecture` (by slug, from `content/site-content.json`) or a post-local diagram from `content/blog/diagrams.json` (same `ArchitectureSchema` shape, keyed by post slug then diagram id) and renders the existing server component `ArchitectureDiagram` inside a `<figure>` with a `<figcaption>`. Nothing ships to the client (server components only). An unknown pod or diagram throws during the static build.

**Tech Stack:** Next.js 16 static export, `next-mdx-remote/rsc` 6 (`blockJS` default: string props only), zod, Tailwind 4, Vitest, Playwright.

## Global Constraints

- No em dashes (U+2014) anywhere (a unit test scans the repo).
- No client company names (C3); sector labels only. Employers (Metrodata) may be named.
- Bilingual: every inserted block exists in `.en.mdx` and `.id.mdx`; Indonesian natural and professional ("saya"), technical terms stay English, matching each ID post's existing terms (for example "job post", "lowongan", "verdict", "login").
- MDX props are plain strings (no `{...}` expressions: `blockJS` strips them).
- Do not change a post's first prose paragraph (the Ask pack keeps the lead paragraph; `tests/ask/pack.test.ts`), title, frontmatter or slug.
- Every node and arrow must be true to the pod data and the post text. Diagrams for systems come from the pod data unchanged.
- Classic JS budget unchanged: no client component, no new dependency.
- Skip `the-sun-the-moon-and-the-dark-sea` (reflective prose, not technical).
- Site has one dark theme; "light and dark" is not applicable.

## File Structure

- Modify `src/components/ArchitectureDiagram.tsx`: stacked one-column layout below `sm` (nodes in layer then row order), grid from `sm`; `not-prose` on its root.
- Create `src/content/architecture.ts`: pure `orderArchitectureNodes(nodes)` and `architectureLayers(nodes)`.
- Modify `src/app/globals.css`: `.prose-hq` element rules skip `.not-prose` subtrees.
- Modify `src/content/schema.ts`: `PostDiagramsSchema`, type `PostDiagrams`.
- Create `content/blog/diagrams.json`: post-local diagrams.
- Create `src/content/post-diagrams.ts`: `getPostDiagrams()`, `resolvePostArchitecture(post, ref, sources?)`, `ARCHITECTURE_TAG`, `architectureRefs(mdx)`.
- Create `src/components/blog/PostArchitecture.tsx` (server): the `<figure>`.
- Create `src/components/blog/mdx.tsx`: `postMdxComponents(post, locale)`.
- Modify `src/app/[locale]/blog/[slug]/page.tsx`: pass `components`.
- Modify the 8 technical post files in `content/blog/`.
- Tests: `tests/unit/architecture-order.test.ts`, `tests/unit/post-diagrams.test.ts`, `tests/content/post-diagrams.test.ts`; `tests/content/safety.test.ts` scans `diagrams.json`; `e2e/pageview.spec.ts` blog figure checks.
- Modify `lighthouserc.json` (add `/en/blog/making-a-voice-agent-interruptible`), `docs/content.md`, `AGENTS.md`, `docs/features.md` status log line.

---

### Task 1: Diagram layout that reads on phones and inside prose

**Files:**
- Create: `src/content/architecture.ts`
- Modify: `src/components/ArchitectureDiagram.tsx`
- Modify: `src/app/globals.css` (`.prose-hq` block, about lines 279 to 351)
- Test: `tests/unit/architecture-order.test.ts`

**Interfaces:**
- Produces: `orderArchitectureNodes<T extends { layer: number; row: number }>(nodes: readonly T[]): T[]` (sorted by layer, then row, stable), `architectureLayers(nodes: readonly { layer: number }[]): number` (max layer + 1). `ArchitectureDiagram({ architecture, locale })` keeps its signature.

- [ ] **Step 1: Write the failing test** `tests/unit/architecture-order.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { architectureLayers, orderArchitectureNodes } from "@/content/architecture";

describe("architecture node order", () => {
  it("orders by layer, then row, without mutating the input", () => {
    const nodes = [
      { id: "c", layer: 2, row: 0 },
      { id: "b", layer: 0, row: 1 },
      { id: "a", layer: 0, row: 0 },
      { id: "d", layer: 1, row: 3 },
    ];
    expect(orderArchitectureNodes(nodes).map((n) => n.id)).toEqual(["a", "b", "d", "c"]);
    expect(nodes[0].id).toBe("c");
  });

  it("counts layers from the deepest node", () => {
    expect(architectureLayers([{ layer: 0 }, { layer: 4 }, { layer: 2 }])).toBe(5);
  });
});
```

- [ ] **Step 2:** `bunx vitest run tests/unit/architecture-order.test.ts`, expect FAIL (module not found).

- [ ] **Step 3: Implement** `src/content/architecture.ts`:

```ts
/** Reading order of architecture nodes: left to right by layer, then top to bottom by row (stacked phone layout, screen readers). */
export function orderArchitectureNodes<T extends { layer: number; row: number }>(nodes: readonly T[]): T[] {
  return [...nodes].sort((a, b) => a.layer - b.layer || a.row - b.row);
}

export function architectureLayers(nodes: readonly { layer: number }[]): number {
  return Math.max(...nodes.map((n) => n.layer)) + 1;
}
```

Then in `ArchitectureDiagram.tsx`: use `architectureLayers`, render `orderArchitectureNodes(architecture.nodes)`, root `className="not-prose card space-y-6 p-4 sm:p-6"`, wrapper `className="pb-2 sm:overflow-x-auto"`, the `ol` `className="grid gap-2.5 sm:min-w-[520px] sm:[grid-template-columns:var(--arch-cols)]"` with `style={{ "--arch-cols": \`repeat(${layers}, minmax(0, 1fr))\` } as CSSProperties}`, each `li` adds `sm:[grid-column:var(--arch-col)] sm:[grid-row:var(--arch-row)]` with `style={{ "--arch-col": node.layer + 1, "--arch-row": node.row + 1 } as CSSProperties}` (import `type CSSProperties` from `react`). Phones (below 640 px) get one column in reading order; no horizontal scroll.

In `globals.css`, rewrite each element rule inside `.prose-hq` so it skips `.not-prose` subtrees, keeping the declarations unchanged, for example:

```css
.prose-hq :where(h2, h3):not(:where(.not-prose, .not-prose *)) { ... }
.prose-hq :where(ul):not(:where(.not-prose, .not-prose *)) { ... }
```

Apply to `h2, h3`, `h2`, `blockquote`, `blockquote::before` (as `.prose-hq :where(blockquote):not(:where(.not-prose, .not-prose *))::before`), `a`, `img`, `ul`, `ol`, `code`, `pre`. Keep `.prose-hq` and `.prose-hq > * + *` as they are.

- [ ] **Step 4:** run the test (PASS), `bun run typecheck`, `bun run lint`.
- [ ] **Step 5: Commit** `feat: stack architecture diagrams on phones and isolate them from prose`.

### Task 2: Post diagrams registry and the MDX `Architecture` tag

**Files:**
- Modify: `src/content/schema.ts` (after `ArchitectureSchema`)
- Create: `content/blog/diagrams.json` (start as `{}`; Task 3 fills it)
- Create: `src/content/post-diagrams.ts`
- Create: `src/components/blog/PostArchitecture.tsx`, `src/components/blog/mdx.tsx`
- Modify: `src/app/[locale]/blog/[slug]/page.tsx`
- Test: `tests/unit/post-diagrams.test.ts`, `tests/content/post-diagrams.test.ts`; modify `tests/content/safety.test.ts`

**Interfaces:**
- Consumes: `ArchitectureSchema`, `Architecture`, `SlugSchema`, `Locale`, `getPods()` from `@/content/load`, `ArchitectureDiagram`.
- Produces:
  - `PostDiagramsSchema = z.record(SlugSchema, z.record(SlugSchema, ArchitectureSchema))`, `type PostDiagrams`.
  - `getPostDiagrams(): PostDiagrams` (parses `content/blog/diagrams.json` once).
  - `type ArchitectureRef = { pod?: string; diagram?: string }`.
  - `resolvePostArchitecture(post: string, ref: ArchitectureRef, sources?: { pods: readonly { slug: string; architecture?: Architecture }[]; diagrams: PostDiagrams }): Architecture` throws `Error` with a message naming the post and the missing pod or diagram, or when both or neither of `pod` and `diagram` are set, or when the pod has no `architecture`.
  - `architectureRefs(mdx: string): (ArchitectureRef & { caption?: string })[]` (every `<Architecture ... />` tag's string props).
  - `postMdxComponents(post: string, locale: Locale): { Architecture: (props: ArchitectureRef & { caption: string }) => JSX }`.

- [ ] **Step 1: Write failing unit tests** `tests/unit/post-diagrams.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { architectureRefs, resolvePostArchitecture } from "@/content/post-diagrams";

const arch = { nodes: [{ id: "a", label: "A", layer: 0, row: 0, kind: "service" as const }], edges: [] };
const sources = { pods: [{ slug: "pod-x", architecture: arch }, { slug: "pod-bare" }], diagrams: { "post-y": { loop: arch } } };

describe("resolvePostArchitecture", () => {
  it("finds a pod's architecture by slug", () => {
    expect(resolvePostArchitecture("post-y", { pod: "pod-x" }, sources)).toBe(arch);
  });
  it("finds a post-local diagram by id", () => {
    expect(resolvePostArchitecture("post-y", { diagram: "loop" }, sources)).toBe(arch);
  });
  it("fails on an unknown pod, a pod without architecture and an unknown diagram", () => {
    expect(() => resolvePostArchitecture("post-y", { pod: "nope" }, sources)).toThrow(/post-y.*nope/);
    expect(() => resolvePostArchitecture("post-y", { pod: "pod-bare" }, sources)).toThrow(/pod-bare/);
    expect(() => resolvePostArchitecture("post-y", { diagram: "nope" }, sources)).toThrow(/post-y.*nope/);
    expect(() => resolvePostArchitecture("other", { diagram: "loop" }, sources)).toThrow(/other.*loop/);
  });
  it("needs exactly one of pod and diagram", () => {
    expect(() => resolvePostArchitecture("post-y", {}, sources)).toThrow(/exactly one/);
    expect(() => resolvePostArchitecture("post-y", { pod: "pod-x", diagram: "loop" }, sources)).toThrow(/exactly one/);
  });
});

describe("architectureRefs", () => {
  it("reads every Architecture tag's string props", () => {
    const mdx = 'Text\n\n<Architecture pod="pod-x" caption="One, two." />\n\n<Architecture diagram="loop" caption="Loop" />\n';
    expect(architectureRefs(mdx)).toEqual([
      { pod: "pod-x", caption: "One, two." },
      { diagram: "loop", caption: "Loop" },
    ]);
  });
});
```

- [ ] **Step 2:** run, expect FAIL.
- [ ] **Step 3: Implement.**

`src/content/schema.ts` (after `ArchitectureSchema`):

```ts
/** Post-local architecture diagrams (content/blog/diagrams.json): post slug, then diagram id, then a pod-shaped `architecture`. */
export const PostDiagramsSchema = z.record(SlugSchema, z.record(SlugSchema, ArchitectureSchema));
export type PostDiagrams = z.infer<typeof PostDiagramsSchema>;
```

`src/content/post-diagrams.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { getPods } from "./load";
import { PostDiagramsSchema, type Architecture, type PostDiagrams } from "./schema";

export const POST_DIAGRAMS_FILE = path.join(process.cwd(), "content", "blog", "diagrams.json");

let cached: PostDiagrams | undefined;
export function getPostDiagrams(): PostDiagrams {
  return (cached ??= PostDiagramsSchema.parse(JSON.parse(readFileSync(POST_DIAGRAMS_FILE, "utf8"))));
}

export type ArchitectureRef = { pod?: string; diagram?: string };
type Sources = { pods: readonly { slug: string; architecture?: Architecture }[]; diagrams: PostDiagrams };

export function resolvePostArchitecture(post: string, ref: ArchitectureRef, sources?: Sources): Architecture {
  const { pods, diagrams } = sources ?? { pods: getPods(), diagrams: getPostDiagrams() };
  if (!ref.pod === !ref.diagram) throw new Error(`Post "${post}": <Architecture> needs exactly one of pod or diagram`);
  if (ref.pod) {
    const pod = pods.find((p) => p.slug === ref.pod);
    if (!pod) throw new Error(`Post "${post}": unknown pod "${ref.pod}" in <Architecture>`);
    if (!pod.architecture) throw new Error(`Post "${post}": pod "${ref.pod}" has no architecture`);
    return pod.architecture;
  }
  const found = diagrams[post]?.[ref.diagram!];
  if (!found) throw new Error(`Post "${post}": unknown diagram "${ref.diagram}" (content/blog/diagrams.json)`);
  return found;
}

const TAG = /<Architecture\b([^>]*?)\/>/g;
const PROP = /(\w+)="([^"]*)"/g;
export function architectureRefs(mdx: string): (ArchitectureRef & { caption?: string })[] {
  return [...mdx.matchAll(TAG)].map((m) => Object.fromEntries([...m[1].matchAll(PROP)].map((p) => [p[1], p[2]])));
}
```

`src/components/blog/PostArchitecture.tsx`:

```tsx
import { ArchitectureDiagram } from "@/components/ArchitectureDiagram";
import { resolvePostArchitecture, type ArchitectureRef } from "@/content/post-diagrams";
import type { Locale } from "@/content/schema";

/** A post's architecture figure: the case-study diagram (or a post-local one) plus a caption. Server only. */
export function PostArchitecture({ post, locale, caption, ...ref }: ArchitectureRef & { post: string; locale: Locale; caption: string }) {
  const architecture = resolvePostArchitecture(post, ref);
  return (
    <figure className="not-prose my-10" data-post-architecture={ref.pod ?? ref.diagram}>
      <ArchitectureDiagram architecture={architecture} locale={locale} />
      <figcaption className="mt-3 text-sm leading-6 text-ink-3">{caption}</figcaption>
    </figure>
  );
}
```

`src/components/blog/mdx.tsx`:

```tsx
import type { ArchitectureRef } from "@/content/post-diagrams";
import type { Locale } from "@/content/schema";
import { PostArchitecture } from "./PostArchitecture";

/** MDX components for one post page; props are strings (next-mdx-remote blocks JS expressions). */
export function postMdxComponents(post: string, locale: Locale) {
  return {
    Architecture: (props: ArchitectureRef & { caption: string }) => <PostArchitecture {...props} post={post} locale={locale} />,
  };
}
```

Page: `compileMDX({ source: found.source, components: postMdxComponents(slug, found.locale), options: { parseFrontmatter: true } })`.

`tests/content/post-diagrams.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { listBlogFiles } from "@/content/blog";
import { getContent } from "@/content/load";
import { architectureRefs, getPostDiagrams, resolvePostArchitecture } from "@/content/post-diagrams";

const files = listBlogFiles();
const refsOf = (slug: string, locale: string) => {
  const f = files.find((x) => x.slug === slug && x.locale === locale);
  return f ? architectureRefs(readFileSync(f.file, "utf8")) : [];
};

describe("post architecture diagrams", () => {
  it("resolves every Architecture tag and gives it a caption", () => {
    for (const { slug, locale, file } of files)
      for (const ref of architectureRefs(readFileSync(file, "utf8"))) {
        expect(() => resolvePostArchitecture(slug, ref), `${slug}.${locale}`).not.toThrow();
        expect(ref.caption?.trim(), `${slug}.${locale} caption`).toBeTruthy();
      }
  });
  it("shows the same diagrams in both languages", () => {
    for (const slug of new Set(files.map((f) => f.slug))) {
      const key = (l: string) => refsOf(slug, l).map((r) => r.pod ?? `diagram:${r.diagram}`);
      if (files.filter((f) => f.slug === slug).length === 2) expect(key("id"), slug).toEqual(key("en"));
    }
  });
  it("keys diagrams by hosted posts and uses each one", () => {
    const hosted = new Set(getContent().floors.library.posts.filter((p) => !p.url).map((p) => p.slug));
    for (const [post, diagrams] of Object.entries(getPostDiagrams())) {
      expect(hosted.has(post), post).toBe(true);
      for (const id of Object.keys(diagrams)) expect(refsOf(post, "en").some((r) => r.diagram === id), `${post}/${id}`).toBe(true);
    }
  });
});
```

`tests/content/safety.test.ts`: include `content/blog/diagrams.json` in the same blocklist and forbidden-pattern scan as `site-content.json` (read it with the existing helpers; follow the file's pattern).

- [ ] **Step 4:** `bunx vitest run tests/unit/post-diagrams.test.ts tests/content/post-diagrams.test.ts tests/content/safety.test.ts`, `bun run typecheck`, `bun run lint` all PASS.
- [ ] **Step 5: Commit** `feat: render architecture diagrams in blog posts through an MDX tag`.

### Task 3: Architecture sections in the four technical posts (EN and ID)

**Files:** `content/blog/{making-a-voice-agent-interruptible,45-percent-of-our-llm-calls-failed,why-the-better-fraud-engine-shipped-in-shadow-mode,spec-driven-development-with-ai-coding-agents}.{en,id}.mdx`, `content/blog/diagrams.json`.

Insert each block exactly as written, with a blank line before and after every tag. Tags stay on one line.

- [ ] **Step 1: Voice post.** EN: new section right before `## Failure one: finished for the model, still playing for the caller`:

```mdx
## Where barge-in happens

<Architecture pod="voice-ai-contact-center" caption="The agent's architecture today, from its case study. At the time of the A/B below, Azure Communication Services carried the call audio instead of LiveKit." />

In the fixed design, an interruption takes this path:

1. The caller's audio reaches the media layer over WebRTC and streams on to the FastAPI realtime backend.
2. The backend relays it to Azure OpenAI Realtime and reads every event the model sends back on one receive loop.
3. When the model calls a tool, such as knowledge search over Azure AI Search, the tool runs as its own cancellable task under a 2.5 s budget, so the receive loop keeps reading.
4. When the "caller started speaking" event arrives, the backend stops the audio on the media channel, cancels the response if it is still generating, and truncates the conversation at what the caller heard.

Failure one below broke step 4. Failure two stopped the receive loop in step 2 from reading.
```

ID: before `## Masalah pertama: selesai bagi model, masih diputar bagi penelepon`:

```mdx
## Di mana barge-in terjadi

<Architecture pod="voice-ai-contact-center" caption="Arsitektur agent saat ini, dari studi kasusnya. Saat A/B di bawah dijalankan, audio panggilan masih lewat Azure Communication Services, bukan LiveKit." />

Pada desain yang sudah diperbaiki, interupsi dari penelepon melewati jalur ini:

1. Audio penelepon masuk ke media layer lewat WebRTC, lalu diteruskan sebagai stream ke backend realtime FastAPI.
2. Backend meneruskannya ke Azure OpenAI Realtime dan membaca setiap event dari model di satu receive loop.
3. Saat model memanggil tool, misalnya pencarian knowledge di Azure AI Search, tool itu berjalan sebagai task tersendiri yang bisa di-cancel, dengan batas waktu 2,5 detik. Receive loop tetap membaca event.
4. Begitu event "penelepon mulai bicara" masuk, backend menghentikan audio di media channel, membatalkan response jika masih dihasilkan, lalu memotong percakapan sampai bagian yang sudah didengar penelepon.

Masalah pertama di bawah merusak langkah 4. Masalah kedua membuat receive loop di langkah 2 berhenti membaca.
```

- [ ] **Step 2: LLM failures post.** EN: at the end of `## Where the result was getting lost` (after the paragraph ending "that candidate and job pair was lost."):

```mdx
<Architecture pod="ai-cv-screening-platform" caption="The platform's architecture today, from its case study. The evaluation harness came months after the batch in this post." />

One evaluation takes this path:

1. A recruiter defines a job post and its candidates in the Next.js web app.
2. The web app calls the FastAPI backend with HMAC-signed requests, and Document Intelligence parses the CVs.
3. Each candidate and job pair runs as a Durable Functions activity that asks the model for structured JSON.
4. The activity parses the reply. This is where the results in this batch were lost: when parsing failed, the pair had no result.
5. Months later, the evaluation harness began running a golden set against the model as a deployment gate in CI.
```

ID: at the end of `## Hasilnya hilang di mana?` (after "...pasangan kandidat dan lowongan itu hilang."):

```mdx
<Architecture pod="ai-cv-screening-platform" caption="Arsitektur platform saat ini, dari studi kasusnya. Harness evaluasi baru ada beberapa bulan setelah batch dalam tulisan ini." />

Satu evaluasi melewati jalur ini:

1. Recruiter menyusun job post dan kandidatnya di web app Next.js.
2. Web app memanggil backend FastAPI dengan request yang ditandatangani HMAC, lalu Document Intelligence mem-parsing CV.
3. Setiap pasangan kandidat dan lowongan berjalan sebagai activity Durable Functions yang meminta JSON terstruktur dari model.
4. Activity mem-parsing balasan model. Di titik inilah hasil dalam batch ini hilang: kalau parsing gagal, pasangan itu tidak punya hasil.
5. Beberapa bulan kemudian, harness evaluasi mulai menjalankan golden set terhadap model sebagai deployment gate di CI.
```

- [ ] **Step 3: Fraud post.** EN: inside `## Production, without control of the verdict`, after the code block and before "The rollout record counts":

```mdx
<Architecture pod="fraud-review-platform" caption="The platform's architecture, from its case study. In the data flow, ⇢ marks the shadow path, which runs asynchronously and only writes to storage." />

A packet takes two paths through the platform:

1. A reviewer uploads a document packet in the Next.js web app, which sends it to the FastAPI backend and shows live progress.
2. The backend runs OCR with Document Intelligence.
3. Agent Framework agents review each document, then the whole packet, through Azure OpenAI, with inputs screened by Prompt Shields. They produce the findings and the verdict the reviewer sees.
4. The backend stores the review history and the report in Cosmos DB and Blob Storage.
5. In parallel, the backend starts a shadow run of the hybrid risk engine. Its results go to storage for comparison and never return to the web app.
```

ID: same position (after the code block, before "Catatan rollout mencatat"):

```mdx
<Architecture pod="fraud-review-platform" caption="Arsitektur platform, dari studi kasusnya. Di alur data, ⇢ menandai jalur shadow, yang berjalan secara asinkron dan hanya menulis ke storage." />

Satu paket melewati dua jalur di platform ini:

1. Reviewer mengunggah paket dokumen di web app Next.js. Web app mengirimnya ke backend FastAPI dan menampilkan progresnya secara live.
2. Backend menjalankan OCR dengan Document Intelligence.
3. Agent dari Agent Framework me-review setiap dokumen, lalu seluruh paket, lewat Azure OpenAI, dengan input yang disaring Prompt Shields. Hasilnya adalah temuan dan verdict yang dilihat reviewer.
4. Backend menyimpan riwayat review dan laporan di Cosmos DB dan Blob Storage.
5. Secara paralel, backend menjalankan engine risiko hybrid dalam shadow run. Hasilnya disimpan untuk perbandingan dan tidak pernah kembali ke web app.
```

- [ ] **Step 4: Spec-driven post, delivery loop.** Add to `content/blog/diagrams.json`:

```json
{
  "spec-driven-development-with-ai-coding-agents": {
    "delivery-loop": {
      "nodes": [
        { "id": "engineer", "label": "Engineer", "sublabel": { "en": "Writes specs, reviews and merges", "id": "Menulis spec, me-review, dan me-merge" }, "layer": 0, "row": 0, "kind": "human" },
        { "id": "spec", "label": "Numbered spec", "sublabel": { "en": "Task, AC and business-rule IDs", "id": "ID task, AC, dan business rule" }, "layer": 1, "row": 0, "kind": "data" },
        { "id": "constitution", "label": "Constitution and conventions", "sublabel": { "en": "Rules every agent follows", "id": "Aturan untuk setiap agent" }, "layer": 1, "row": 1, "kind": "data" },
        { "id": "agents", "label": "Coding agents", "sublabel": { "en": "GitHub Copilot and Claude, one worktree each", "id": "GitHub Copilot dan Claude, satu worktree per agent" }, "layer": 2, "row": 0, "kind": "ai" },
        { "id": "ci", "label": "CI gates", "sublabel": { "en": "Spec IDs, contracts, architecture tests", "id": "ID spec, kontrak, architecture test" }, "layer": 3, "row": 0, "kind": "service" },
        { "id": "main", "label": "Main branch", "layer": 4, "row": 0, "kind": "external" },
        { "id": "app-service", "label": "Azure App Service", "sublabel": { "en": "Deploys only after green CI", "id": "Deploy hanya setelah CI hijau" }, "layer": 4, "row": 1, "kind": "external" }
      ],
      "edges": [
        { "from": "engineer", "to": "spec", "label": "write" },
        { "from": "spec", "to": "agents", "label": "tasks" },
        { "from": "constitution", "to": "agents", "label": "rules" },
        { "from": "agents", "to": "ci", "label": "pull requests" },
        { "from": "ci", "to": "engineer", "label": "review" },
        { "from": "engineer", "to": "main", "label": "merge" },
        { "from": "main", "to": "app-service", "label": "deploy" }
      ]
    }
  }
}
```

EN: in `## The loop`, replace the fenced code block after "Every feature went through the same path:" with:

```mdx
<Architecture diagram="delivery-loop" caption="The delivery loop every feature went through." />

1. I wrote a numbered spec with task, acceptance-criteria and business-rule IDs.
2. An agent read it together with the constitution and the agent conventions file.
3. The agent implemented it in its own git worktree and opened a pull request.
4. CI gates checked the pull request.
5. I reviewed it and decided whether it merged.
6. Deployment to Azure App Service ran only after CI was green.
```

ID: in `## Alur kerjanya`, replace the code block after "Setiap fitur melewati jalur yang sama:" with:

```mdx
<Architecture diagram="delivery-loop" caption="Alur delivery yang dilalui setiap fitur." />

1. Saya menulis spec bernomor dengan ID task, acceptance criteria, dan business rule.
2. Agent membacanya bersama constitution dan file konvensi agent.
3. Agent mengerjakannya di git worktree sendiri, lalu membuka pull request.
4. CI gate memeriksa pull request itu.
5. Saya me-review dan memutuskan apakah pull request itu di-merge.
6. Deploy ke Azure App Service hanya berjalan setelah CI hijau.
```

- [ ] **Step 5: Spec-driven post, the system.** EN: new section right before `## What got through anyway`:

```mdx
## The system the agents built

<Architecture pod="vendor-management-portal" caption="The portal's architecture, from its case study." />

The two-boundary rule shapes how a signed-in request flows:

1. Vendors and internal approvers use the Next.js portal. It serves the UI and acts as the backend-for-frontend, holding the session in a sealed HttpOnly cookie.
2. Staff sign in with Entra ID through the FastAPI backend, which writes the session to PostgreSQL.
3. Every portal request reaches the FastAPI backend over REST. The backend re-derives the user's permissions from the database on every request, so the cookie only needs what the UI uses for gating.
4. Browsers upload documents straight to Blob Storage, and the backend works with them there.

The cookie bug below lived in steps 1 and 3. The commit-timing bug lived in step 2.
```

ID: before `## Yang tetap lolos`:

```mdx
## Sistem yang dibangun para agent

<Architecture pod="vendor-management-portal" caption="Arsitektur portal, dari studi kasusnya." />

Two-boundary rule menentukan alur request setelah login:

1. Vendor dan approver internal memakai portal Next.js. Portal ini menyajikan UI sekaligus menjadi backend-for-frontend, dan menyimpan sesi dalam sealed HttpOnly cookie.
2. Staf login dengan Entra ID lewat backend FastAPI, yang menulis sesi ke PostgreSQL.
3. Setiap request dari portal masuk ke backend FastAPI lewat REST. Backend menurunkan ulang permission user dari database pada setiap request, jadi cookie cukup menyimpan yang dibutuhkan UI untuk gating.
4. Browser mengunggah dokumen langsung ke Blob Storage, dan backend mengolahnya di sana.

Bug cookie di bawah ada di langkah 1 dan 3. Bug waktu commit ada di langkah 2.
```

- [ ] **Step 6:** `bun run validate:content`, `bunx vitest run tests/content tests/ask` PASS; `rg -n "\u2014" content/blog` empty.
- [ ] **Step 7: Commit** `docs(blog): add architecture sections to the four technical posts`.

### Task 4: Guards, docs and budgets

**Files:** `e2e/pageview.spec.ts`, `lighthouserc.json`, `docs/content.md`, `docs/features.md`, `AGENTS.md`.

- [ ] **Step 1: e2e.** In `e2e/pageview.spec.ts` add a test per post with a figure (slugs listed in the test: the four technical posts): open `/en/blog/<slug>?tier=static` at 390x844, assert `figure[data-post-architecture]` count matches (spec-driven: 2, others: 1), each figure has a non-empty `figcaption`, `document.documentElement.scrollWidth <= 390`, and `expectNoSeriousViolations(page)`. One more at 1440x900 for `/id/blog/spec-driven-development-with-ai-coding-agents` checks that list items inside the figure have `list-style-type: none` (prose rules do not leak).
- [ ] **Step 2: Lighthouse.** Add `"http://127.0.0.1:4320/en/blog/making-a-voice-agent-interruptible"` to `lighthouserc.json` `collect.url` (before `/en/contact`).
- [ ] **Step 3: Docs.** `docs/content.md` "Dataset and posts": a bullet on `<Architecture pod="<pod-slug>" caption="..." />` and `<Architecture diagram="<id>" caption="..." />` (data in `content/blog/diagrams.json`, keyed by post slug then id, the pod `architecture` shape; string props only; follow it with a numbered walkthrough; same tags in both locales; an unknown pod or diagram fails the build and `tests/content/post-diagrams.test.ts`). `AGENTS.md`: folder layout lines for `content/blog/diagrams.json` and `src/components/blog/`, and one sentence in "Content access". `docs/features.md`: one status log line.
- [ ] **Step 4: Commit** `test: guard blog architecture figures; docs`.

### Task 5: Verification and PR

- [ ] `bun run verify:quick`; `bun run e2e:changed`; `E2E_PORT=<port> bunx lhci autorun` or `bunx @lhci/cli collect` against the post URL (LCP, CLS, TBT, document size within budgets).
- [ ] Byte deltas: HTML and RSC `.txt` sizes (raw and gzip) of every `out/*/blog/*` file against the baseline build; client chunk total unchanged.
- [ ] Captures of every post figure at 1440x900 and 390x844 (Playwright, `?tier=static`), saved in the session files folder.
- [ ] Check CI queue (`gh run list -R ShinyQ/ShinyQ-HQ -s in_progress` and `-s queued`), push, open the PR (not merged), report to the coordinator.
