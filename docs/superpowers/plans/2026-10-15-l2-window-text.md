# L2 Workshop window text removal (Round 7 H)

Status: shipped in #154 (654e9a5), 2026-10-15

Owner decision 2026-10-15 (option 3 of the Round 7 design, section 9, chosen after a "Now" plate prototype read badly in captures): remove the "▲ L3 Labs above" label at the L2 Workshop window and keep the window clean.

## Change

- `src/experience/floors/career/WorkshopAnnex.tsx`: drop the `Readable` + `Text` label and the `WorkshopLabels.window` field (and the now unused `Text`, `Readable`, `monoWidth` and `FONTS` imports). The glass window, the sight lines toward L3 and every other Workshop piece stay unchanged.
- `src/experience/Experience.tsx`: drop `window: t("career.window")`.
- `messages/en.json`, `messages/id.json`: drop `hud.career.window`.
- Docs: `AGENTS.md` (L2 Career Road bullet) and `docs/features.md` (Horizon bullet) say the window carries no text.

## Budgets

One troika text mesh fewer on L2: one draw call fewer, no new program.

## Verification

- `bun run verify:quick`, then `bun run e2e:changed` (workshop, career and the other specs mapped to the changed paths).
- Before/after captures at 1440x900 full and 390x844 lite at the annex and the road end.
