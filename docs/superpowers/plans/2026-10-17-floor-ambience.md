# Floor Ambience Implementation Plan

Status: shipped in #193 (d4bcd0c), 2026-10-17.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Each floor adds a quiet procedural layer under Deep Space Ambient (L1 chime pad, L2 warm analog pulse, L3 light arpeggio, L4 typewriter ticks and paper noise, RF wind and distant radio beeps) that crossfades over 2 s on a floor change, with a "Floor ambience" toggle in the settings panel's sound group (Round 9 O, spec section 5.1).

**Architecture:** The owner approved the five layers as auditioned (2026-10-17, levels unchanged). The audition module ships verbatim as `src/lib/audio/ambience.ts` (only its two imports change to `./music` and `./synth`). The engine loads it with a dynamic `import("./ambience")` the first time ambience must sound (after a gesture, while audible), so it stays out of the first-frame path and the Classic site. The ambience voice feeds the music bus (the music volume scales it; effects stay on the master untouched) and follows the music's mute, pause and tab rules. `Experience` reports the floor to the engine; a new setting toggles it.

**Tech Stack:** Web Audio, TypeScript, Vitest, Playwright, next-intl.

## Global Constraints

- No audio files; no em dashes (U+2014) anywhere.
- Owner decision: layers, levels (`AMBIENCE_LEVEL` 0.4) and crossfade (`AMBIENCE_CROSSFADE` 2 s) exactly as auditioned; do not retune.
- Same mute, pause and tab rules as the music; never masking sound effects (the ambience never touches the master gain or the effects path).
- Setting: id `ambience`, group `sound`, label "Floor ambience" (EN) / "Suasana lantai" (ID), persisted in `localStorage["hq:ambience"]` (`"off"` disables, missing is on), independent of the music toggle.
- Budgets: 3D first-frame 450 KB (ambience must not be on it), session full 470 KB / lite 446.4 KB, Classic JS 240 KB unchanged.
- Docs: `src/lib/audio/README.md`, `docs/agents/ci-and-deploy.md` (Audio), `docs/agents/hud-and-drawer.md` (settings, storage keys), `docs/features.md`, `docs/decisions.md`, `docs/superpowers/README.md`.

---

### Task 1: Ship the ambience module

**Files:**
- Create: `src/lib/audio/ambience.ts` (copy of the approved audition module, imports rewritten)
- Test: `tests/unit/audio-ambience.test.ts`

**Interfaces:**
- Produces (unchanged from the audition): `AmbienceFloor`, `AMBIENCE_FLOORS`, `AMBIENCE_CROSSFADE` (2), `AMBIENCE_LEVEL` (0.4), `AmbienceLayer`, `AMBIENCE_LAYERS`, `AmbienceVoice { output; setFloor(floor | null); floor(); activeLayers(); stop() }`, `createAmbience(ctx, destination, random?)`.

- [x] Step 1: Port the audition sanity checks (`files/ambience/check.ts`) into Vitest with the repo's fake AudioContext pattern (see `tests/unit/audio-music.test.ts`): every layer schedules notes and `stop()` leaves 0 active notes, 0 connected nodes and no timers; rapid `setFloor` L1 to RF then null within 1 s never has more than 3 live layers; same floor is a no-op; a 5 s stall schedules at most one step; every pitched frequency in C major pentatonic.
- [x] Step 2: Copy the module, rewrite imports, run the test, typecheck, lint. Commit `feat(audio): floor ambience layers`.

### Task 2: Engine integration and the setting

**Files:**
- Modify: `src/lib/audio/{engine,types,singleton,useAudio,index}.ts`
- Modify: `src/hud/settings/defs/{sound,index}.ts`, `messages/en.json`, `messages/id.json`
- Modify: `src/experience/Experience.tsx` (report the floor)
- Test: `tests/unit/audio.test.ts`, `tests/unit/settings-registry.test.ts` (or the sound setting test), `e2e` settings check if one lists sound rows

**Interfaces:**
- `AudioSettings.ambience: boolean`; `AMBIENCE_STORAGE_KEY = "hq:ambience"`.
- `AudioEngine.setAmbience(on: boolean): void`, `AudioEngine.setFloor(floor: AmbienceFloor | null): void`, `AudioEngine.ambienceFloor(): AmbienceFloor | null` (probe for tests).
- Setting `ambienceSetting` (id `ambience`, order 35, `labelKey: "ambience.label"`).

Behavior:
- The engine remembers the floor. Ambience sounds when not muted, not paused, not disposed, the context exists, `settings.ambience` is on and a floor is set. Starting: `import("./ambience")` once (cache the promise; ignore a result that arrives after a stop or a mute), `createAmbience(ctx, musicBus)`, `setFloor(floor)` (2 s fade in).
- `setFloor` while sounding crossfades (`voice.setFloor`). `setFloor(null)` fades out.
- Mute, pause and the post-fade suspend stop the ambience exactly where they stop the music; unmute and unpause restart it. Hidden tab: suspend only (like the music).
- `setAmbience(false)` stops the voice at once and persists `"off"`; `setAmbience(true)` persists and starts it when audible.
- `useAudioSettings` server snapshot gains `ambience: true`.
- `Experience` calls `audio.setFloor(store.floor)` on mount and on every floor change (subscribe), and `audio.setFloor(null)` on unmount before pausing.

- [x] Step 1: Failing unit tests in `tests/unit/audio.test.ts` with the existing fake context: ambience starts after the gesture with the floor set; floor change crossfades (voice `setFloor` called); mute stops it and unmute restarts it; `setAmbience(false)` stops and persists; `hq:ambience` `"off"` read at creation; no ambience while paused; the effects path is unchanged (`play("beep")` connects to the master, not the music bus).
- [x] Step 2: Implement engine, types, singleton proxy, `useAudioSettings`, setting def, messages (EN "Floor ambience", ID "Suasana lantai"), `Experience` floor reporting.
- [x] Step 3: `bun run verify:quick`; commit `feat(audio): floor ambience in the engine and the Floor ambience setting`.

### Task 3: E2E and docs

**Files:**
- Test: `e2e/hud-corners.spec.ts` or a new `e2e/ambience.spec.ts` (the setting row exists in the sound group with the EN label and toggles `hq:ambience`; with sound on, after a gesture, `__hq` or the engine probe reports the current floor and follows a floor change)
- Modify: docs listed in Global Constraints; `scripts/e2e-plan.ts` mapping if needed.

- [x] Step 1: Write the e2e (wait on state), run it and `bun run e2e:changed`.
- [x] Step 2: Docs (current state), the decisions row (2026-10-17: owner approved the five floor layers as auditioned), plans index row. Commit `docs: floor ambience`.
