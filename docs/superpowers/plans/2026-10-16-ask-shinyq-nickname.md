# Ask the HQ: "ShinyQ" Is Kurniadi's Nickname Implementation Plan

Status: shipped in #160 (5366a23), 2026-10-16

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ask the HQ treats "ShinyQ" (any case, also "Shiny Q", "Shiny-Q") as Kurniadi's nickname, so "Who is ShinyQ?", "What does ShinyQ do?" and "Apa itu ShinyQ?" are answered as questions about him, while "ShinyQ HQ" still means this site.

**Architecture:** A pure, deterministic alias step in `functions/_lib/scope.ts` (`resolveNickname(question)`) rewrites the nickname to "Kurniadi" (never touching "ShinyQ HQ") before scope routing and retrieval in `runPipeline`; the output checks accept the nickname as a known name; the knowledge pack's profile chunk states the fact ("Kurniadi also goes by the nickname ShinyQ; ShinyQ HQ is his site") so answers stay grounded. Golden items cover EN and ID.

**Tech Stack:** Cloudflare Pages Functions (TypeScript, no new dependencies), Vitest, `scripts/ask-eval.ts`.

## Global Constraints

- No em dashes (U+2014) anywhere.
- Owner request (verbatim): "in my chatbot if someone referring ShinyQ its my nickname for Kurniadi".
- "ShinyQ HQ" (also "ShinyQ-HQ", "Shiny Q HQ") keeps meaning this site (`isSiteQuestion`).
- The pack stays under `PACK_MAX_BYTES` (256 KiB) with every perspective approved (`tests/ask/pack.test.ts`).
- Answers stay third person (the assistant is not the owner). Bump `PROMPT_VERSION` only if `functions/_lib/prompt.ts` changes.
- Golden items for EN and ID; `tests/ask/golden.json` `$comment` and `passThreshold` updated in the same PR.

---

### Task 1: Nickname resolution in scope and retrieval

**Files:**
- Modify: `functions/_lib/scope.ts` (add `resolveNickname`)
- Modify: `functions/_lib/pipeline.ts` (apply it to the cleaned question before scope and retrieval; the cache key and logs keep using the cleaned question as today)
- Modify: `functions/_lib/checks.ts` (known vocabulary: add `shiny` so "Shiny Q" in an answer is not an unknown name; `shinyq` is already there)
- Test: `tests/ask/scope.test.ts`, `tests/ask/pipeline.test.ts`

**Interfaces:**
- Produces: `resolveNickname(question: string): string` (pure).

- [x] **Step 1: Write the failing tests** in `tests/ask/scope.test.ts`:

```ts
describe("resolveNickname (owner 2026-10-16: ShinyQ is Kurniadi's nickname)", () => {
  it.each([
    ["Who is ShinyQ?", "Who is Kurniadi?"],
    ["what does shinyq do", "what does Kurniadi do"],
    ["Apa itu ShinyQ?", "Apa itu Kurniadi?"],
    ["Is Shiny Q open to freelance work?", "Is Kurniadi open to freelance work?"],
    ["Siapa Shiny-Q?", "Siapa Kurniadi?"],
    ["ShinyQ's projects", "Kurniadi's projects"],
  ])("%s", (q, out) => expect(resolveNickname(q)).toBe(out));

  it.each(["How was ShinyQ HQ built?", "What stack does ShinyQ-HQ use?", "Shiny Q HQ hosting?", "github.com/ShinyQ/ShinyQ-HQ"])("keeps the site name: %s", (q) => {
    expect(resolveNickname(q)).toBe(q);
    expect(isSiteQuestion(resolveNickname(q))).toBe(isSiteQuestion(q));
  });

  it("routes nickname questions like questions about him", () => {
    expect(isGeneralAssistantRequest(resolveNickname("Who is ShinyQ?"))).toBe(false);
    expect(privateTopic(resolveNickname("What does ShinyQ do?"))).toBeNull();
  });
});
```

(Adjust imports to the file's existing ones; the GitHub URL case must not change because "ShinyQ/" is a path segment: treat a nickname followed by `/` or preceded by `/` as a URL part and leave it.) In `tests/ask/pipeline.test.ts`, using the file's existing fake model and pack, add: "Who is ShinyQ?" and "Apa itu ShinyQ?" retrieve the `profile` chunk and reach the model (not a decline), and "How was ShinyQ HQ built?" still retrieves `site-build`.

- [x] **Step 2: Run** `bunx vitest run tests/ask/scope.test.ts tests/ask/pipeline.test.ts`. Expected: FAIL.

- [x] **Step 3: Implement** in `functions/_lib/scope.ts`:

```ts
/**
 * "ShinyQ" is Kurniadi's nickname (owner 2026-10-16): questions that use it are about him. "ShinyQ HQ"
 * (this site) and URL parts ("github.com/ShinyQ/...") keep their meaning.
 */
const NICKNAME = /(?<![\w/.])shiny[ -]?q(?![ -]?hq\b)(?![\w/])/gi;

export function resolveNickname(question: string): string {
  return question.replace(NICKNAME, "Kurniadi");
}
```

Verify the possessive case ("ShinyQ's" becomes "Kurniadi's"): `'` is not in `[\w/]`, so the lookahead passes. In `functions/_lib/pipeline.ts`, apply `resolveNickname` once to the cleaned, PII-scrubbed question and pass the result to every scope function, routing and retrieval call (read the file first; keep the cache key, analytics fields and the rate limiter on the existing values). In `functions/_lib/checks.ts` add `shiny` to the known word list next to `shinyq`.

- [x] **Step 4: Run** `bunx vitest run tests/ask`. Expected: PASS.

- [x] **Step 5: Commit** `feat(ask): treat ShinyQ as Kurniadi's nickname`.

### Task 2: Grounding and golden cases

**Files:**
- Modify: `src/ask/pack.ts` (profile chunk text and keywords: "Kurniadi also goes by the nickname ShinyQ (his GitHub handle); ShinyQ HQ is his site." in EN, "Kurniadi juga dikenal dengan nama panggilan ShinyQ (nama akun GitHub-nya); ShinyQ HQ adalah situsnya." in ID, plus keyword `shinyq`, `nickname`, `panggilan`)
- Modify: `tests/ask/golden.json` (q60 to q63), `tests/ask/pack.test.ts` (assert the profile chunk carries the nickname)
- Modify: `docs/ask-runbook.md` (one line in the scope section), `AGENTS.md` ("Ask the HQ" bullet: nickname alias)

- [x] **Step 1: Write the failing test** in `tests/ask/pack.test.ts`:

```ts
it("names the ShinyQ nickname in the profile chunk (owner 2026-10-16)", () => {
  for (const locale of ["en", "id"] as const) {
    const profile = buildPack(/* the file's existing inputs */)[locale].chunks.find((c) => c.id === "profile")!;
    expect(profile.text).toMatch(/ShinyQ/);
  }
});
```

(Follow the file's existing pattern for building the pack and reading chunks.)

- [x] **Step 2: Run** `bunx vitest run tests/ask/pack.test.ts`. Expected: FAIL.

- [x] **Step 3: Implement** the profile chunk sentence (read `src/ask/pack.ts` to find where the profile chunk text is assembled; the sentence comes from code, not content, so it stays one place), then add golden items:

```json
{"id": "q60", "lang": "en", "q": "Who is ShinyQ?", "facts": ["ShinyQ"], "expect": {"any": ["kurniadi"]}},
{"id": "q61", "lang": "en", "q": "What does ShinyQ do?", "facts": ["Metrodata"], "expect": {"any": ["metrodata", "mitra integrasi", "ai"]}},
{"id": "q62", "lang": "id", "q": "Apa itu ShinyQ?", "facts": ["ShinyQ"], "expect": {"any": ["kurniadi"]}},
{"id": "q63", "lang": "id", "q": "ShinyQ sekarang kerja di mana?", "facts": ["Metrodata"], "expect": {"any": ["metrodata", "mitra integrasi"]}}
```

Match the shape of existing items exactly (look at q01 and the ID items); update the `$comment` count sentence and raise `passThreshold` by the same share the file uses (read how 56 relates to the item count and keep the ratio).

- [x] **Step 4: Run** `bunx vitest run tests/ask` (golden drift and retrieval checks, pack size). Expected: PASS.

- [x] **Step 5: Docs and verify.** One line in `docs/ask-runbook.md` scope section and the AGENTS.md "Ask the HQ" bullet. `bun run verify:quick`, then `E2E_PORT=<port> bun run e2e:changed`.

- [x] **Step 6: Commit** `feat(ask): ground the ShinyQ nickname and add golden cases`.
