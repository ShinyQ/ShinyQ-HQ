# English Editorial Rewrite

Status: Editorial direction and written specification approved by the owner.

## Goal

Make the site's English sound natural and technically grounded without losing
context, precision or the owner's voice. Review every public English surface.
Rewrite passages that need it and retain strong existing writing.

Depth means explaining the problem, constraints, decisions, consequences and
limitations. It does not mean making every label or paragraph longer.

## Confirmed Owner Decisions

- Cover all public English copy, including articles and interface messages.
- Use natural, technically grounded English rather than a marketing voice.
- Keep Indonesian copy and the CV PDF unchanged.
- Preserve factual claims, measurement boundaries, attribution and confidentiality.
- Do not redesign the site or change application behaviour.

## Baseline and Instructions

The inspected remote main commit is
`2ad3c1ac5016440dda8a20c293f6c3374a1ef255`.
The configured primary checkout is older. Implementation starts from current
main in an isolated coding session and does not modify the primary checkout.

Read current `AGENTS.md`, `CLAUDE.md` and the relevant `docs/agents/` guidance
before implementation. Follow the content-style-and-safety rules, including
Title Case, pronoun-free titles, protected content and copy-length limits.

## Content Coverage

| Surface | Authoritative sources | Treatment |
|---|---|---|
| Profile, career, projects, results, awards, contact and missions | `content/site-content.json` | Review all English leaves, including the 40 project and 37 career entries; preserve shared facts and identifiers |
| Hosted English articles | All 10 `content/blog/*.en.mdx` files | Edit complete narratives in context; keep code, links, citations and valid MDX |
| Article listings and metadata | Post registry, MDX frontmatter and their consumers | Keep each English title and excerpt consistent across sources; preserve slugs and publication dates |
| Build story and public perspectives | `content/build-story.json`, `content/perspectives.json` | Edit only public, approved material; preserve opinions, qualifications and publication state |
| Other authored public content | Study-guide metadata, sculpture descriptions, blog diagrams and eligible case-study diagram labels | Include reader-facing English prose; preserve official names, documents and graph structure |
| Interface, accessibility and 3D guidance | `messages/en.json` and any additional authoritative public string sources | Keep controls concise, errors actionable and Rover distinct from the owner |
| Ask source copy and visible fixed responses | `content/ask/site-build.json`, English suggestions, `functions/_lib/messages.ts` | Preserve scope and attribution; edit English source prose and visible responses without changing routing or safety behaviour |
| Search, share and structured-data copy | English message templates and `src/lib/seo.ts`, `src/lib/jsonld.ts` consumers | Prefer editing authoritative copy; retain length limits, facts, canonicals and schema |

Inventory additional public strings before editing. A reviewed item may remain
unchanged when it is already clear or is a protected literal. Record coverage so
"all English" is not inferred merely from the files appearing in a diff.

## Editorial Rules

- Use first person in owner stories and technical body text.
- Keep titles, taglines, mottos and share-card titles free of first person.
- Keep Rover's voice separate from the owner. Ask attributes the owner's work
  and views rather than impersonating him.
- Prefer concrete verbs, natural sentence rhythm and explicit connections.
- Explain necessary jargon in context without removing useful technical terms.
- Preserve technical depth, negative results, uncertainty and team credit.
- Put measurement boundaries beside compact claims, not only in later prose.
- Do not force every article into the same outline or rewrite strong passages
  simply to make the diff larger.
- Do not use em dashes, hype, invented outcomes or detector scores as evidence.

### Approved Direction Example

Current:

> I make LLM systems reliable in production through evaluation, guardrails and
> observability.

Direction:

> Getting an LLM response is only part of the job. I use evaluation to decide
> what to ship, guardrails to keep the system within its limits, and observability
> to understand failures in production.

This illustrates the voice, not mandatory wording for every surface.

## Evidence and Confidentiality

Use the existing public content and its approved supporting sources. Additional
explanation must follow from that evidence. Do not invent responsibilities,
causal claims, deployments, results or production guarantees to make prose richer.
Flag an evidence gap rather than fill it with a plausible story.

Preserve numbers, dates, confidence classifications and distinctions between
lab, offline, PoC, shadow and live results. Historical counts remain anchored
to the article's publication period, not silently updated to a current count.

The benchmark article remains about the method, not proprietary tasks. Do not
add LILT to that article or expose task names, mechanisms, private repositories,
reviewer identities or per-task scores. Preserve "very hard" and the distinction
between submitted, approved and merged work.

## Compatibility and Exclusions

- Leave all Indonesian copy unchanged. Compare source values and rendered
  fallbacks, not only `.id.mdx` files and `messages/id.json`.
- Do not edit the complete protected Sun/Moon essay family, including its
  English registry text, frontmatter and accessible text. Do not translate it.
- Do not rewrite external articles, hosted papers, study-guide PDFs, the CV PDF
  or their rendered page images. Official titles, names and attributed quotes
  remain intact.
- Preserve message keys, placeholders, ICU syntax, links, slugs, dates, code
  examples, diagram IDs and topology, permissions and publication flags.
- An unlocalized English string may also appear in Indonesian. Preserve its
  Indonesian output. Use an existing supported localized representation when
  appropriate; do not introduce a schema migration solely for editorial scope.
- Edit authored sources rather than generated exports. Regenerate derived
  indexes, packs or embedding caches only through the existing workflows.
- Do not expand retrieval budgets, relax safety gates, alter prompt behaviour
  or raise HTML/CSS/JavaScript limits to fit prose.
- Keep the current layout, reading typography and established product names.

## Review and Acceptance

1. Maintain a source inventory identifying edited, retained and excluded copy.
2. Read every in-scope passage in context, not as isolated dictionary values.
3. Verify that revised claims match their original meaning and evidence.
4. Confirm Indonesian and protected assets are unchanged, including fallbacks.
5. Keep article frontmatter and the registry aligned; compile through the shared
   MDX path and retain diagram captions and references.
6. Preserve UI and SEO limits, schema validity, title rules and localization
   contracts using the existing targeted checks.
7. Check Ask retrieval, source coverage, generated pack limits and relevant
   golden expectations after changing its source text.
8. Review representative desktop and mobile pages, result strips and 3D drawers
   for wrapping, clipping and reading flow without redesigning them.
9. Complete the required repository checks in the coding session. Do not weaken
   assertions solely to make new wording pass.
10. Present the completed editorial changes for owner review. This planning
    approval does not authorize pushing, opening a PR, merging or deploying.

## Execution Boundary

The owner approved this specification and its implementation plan before edits.
The original approved artifact remains in the coordinating session. This
repository copy records the same editorial scope and acceptance requirements.
