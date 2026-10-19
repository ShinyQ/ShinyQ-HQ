# Audio engine

Procedural Web Audio for ShinyQ HQ (appendix 05 section 5, owner adaptation: every sound is synthesized, there are no audio files). No dependencies, SSR safe, on by default (the visitor's mute is persisted and always respected).

```ts
import { audio, useAudio } from "@/lib/audio";
```

The engine (`engine.ts` with `synth.ts` and `music.ts`) is a lazy chunk behind the `audio` facade (`singleton.ts`); `@/lib/audio` never imports it, so tests import `createAudioEngine` from `@/lib/audio/engine`. The storage keys and their parsing live in `settings.ts`, shared by both.

## API

| Member | Signature | Notes |
| --- | --- | --- |
| `audio` | `AudioEngine` | The lazy facade (`createAudioFacade()`). Importing creates nothing and loads nothing; the engine chunk loads on the first call that needs sound (see Behavior). |
| `createAudioFacade` | `(options?: AudioFacadeOptions) => AudioEngine` | For tests. Options: `load` (the engine module loader), `hasActivation` (user activation probe), `deps` (passed to `createAudioEngine`; its `storage` and `doc` are also what the facade reads and listens on). |
| `createAudioEngine` | `(deps?: Partial<AudioEngineDeps>) => AudioEngine` | From `@/lib/audio/engine`, for tests or isolated instances. Deps: `createContext`, `storage`, `doc`, `now`, `loadAmbience` (loads the ambience chunk), `paused` (the initial pause state), `started` (adopt the context `createContext` returns and start at creation; the facade sets it after a gesture). |
| `play` | `(name: SoundName) => void` | `"beep" \| "ding" \| "whoosh" \| "click" \| "blip" \| "chime"`. No-op while muted. |
| `setRumble` | `(speed: number) => void` | Rover speed in u/s. At or below 1 is silent, clamps at 12. Gain and cutoff glide with `setTargetAtTime`. |
| `setMuted` | `(muted: boolean) => void` | Persists `"on"` / `"off"` in `localStorage["hq:sound"]`. The first unmute creates the `AudioContext`, resumes it and starts the background music. |
| `toggleMuted` | `() => void` | Same as `setMuted(!isMuted())`. |
| `setPaused` | `(paused: boolean) => void` | Silences everything while the 3D view is closed (Page View) without touching the stored setting. `Experience` pauses on unmount and unpauses on mount. |
| `isPaused` | `() => boolean` | Current pause state. |
| `isMuted` | `() => boolean` | Current setting. |
| `getSettings` | `() => AudioSettings` | `{ effects, music, musicVolume, ambience }`. The same object until a setting changes (stable for `useSyncExternalStore`). |
| `setEffects` | `(on: boolean) => void` | Persists `localStorage["hq:sfx"]` (`"off"` disables, missing is on). Off makes `play` a no-op and keeps the rumble silent. |
| `setMusic` | `(on: boolean) => void` | Persists `localStorage["hq:music"]` (`"off"` disables, missing is on). Off stops the music voice at once; on starts a fresh one when audible and no floor layer replaces it. |
| `setMusicVolume` | `(volume: number) => void` | Clamped 0 to 1, persisted in `localStorage["hq:music-volume"]` (missing is 1). Glides the music bus with `setTargetAtTime` (time constant 0.05). |
| `setAmbience` | `(on: boolean) => void` | Persists `localStorage["hq:ambience"]` (`"off"` disables, missing is on). Off fades the floor ambience out over `AMBIENCE_CROSSFADE` and stops it; on starts it when audible and a floor is set. While on with a floor set, the floor layer replaces the music (2 s crossfade); off crossfades back to the music (when the music toggle is on). |
| `setFloor` | `(floor: AmbienceFloor \| null) => void` | The floor the ambience follows (`"L1"` to `"RF"`, and `"B1"`). Crossfades while sounding, is remembered while silent, `null` fades out and hands back to the music. `Experience` reports the store floor on mount and on every change, and on unmount pauses first, then reports `null`. |
| `ambienceFloor` | `() => AmbienceFloor \| null` | The remembered floor (a probe). |
| `playCounts` | `() => Readonly<Partial<Record<SoundName, number>>>` | How many times `play` was called per one-shot (a copy; counted before the mute and effects checks, so tests see calls while muted). A probe for tests, read through `window.__hq.audio().played`. |
| `subscribe` | `(listener: () => void) => () => void` | Called on mute and setting changes. Shaped for `useSyncExternalStore`. |
| `dispose` | `() => void` | Removes document listeners and closes the context. |
| `useAudio` | `(engine?: AudioEngine) => { muted, setMuted, toggleMuted, play, setRumble }` | Client hook. Server render and hydration report `muted: true`. |
| `useAudioSettings` | `(engine?: AudioEngine) => AudioSettings` | Client hook for the Settings panel. Server render reports `{ effects: true, music: true, musicVolume: 1, ambience: true }`. |

## Sounds

| Sound | Call | Length | Synthesis |
| --- | --- | --- | --- |
| Background music: "Deep Space Ambient" | automatic while unmuted | endless, never repeats exactly | Three triangle drones (MIDI 36, 43, 48) through a 600 Hz lowpass; every 0.5 s a 35 percent chance of a C major pentatonic glass bell (sine, 2.6 s decay, plus a 2.01x partial); 3 s synthetic convolution reverb at 60 percent wet and a compressor on the music bus; output trim 0.6 (the site's ambient level, quiet enough that the effects stay on top) |
| Floor ambience | automatic while unmuted and a floor is set | endless, crossfades 2 s on a floor change | One texture per floor that replaces the music while it plays (table below) |
| Rover beep | `play("beep")` | about 120 ms | Two square tones (1320 Hz then 1980 Hz) |
| Tread rumble | `setRumble(speed)` | loop | Looped brown noise through a lowpass; gain and cutoff follow speed |
| Elevator ding | `play("ding")` | about 550 ms | Inharmonic sine partials with exponential decay |
| Drawer whoosh | `play("whoosh")` | about 220 ms | Band-passed noise with a rising sweep |
| B1 unlock chime | `play("chime")` | about 780 ms | Three sine notes, C6, E6 and G6, 90 ms apart, each decaying over 600 ms |
| Key click | `play("click")` | about 25 ms | High-passed noise burst, rate limited to 20 per second (extras dropped) |

### Floor ambience layers

`src/lib/audio/ambience.ts`, loudness matched to each other at `AMBIENCE_LEVEL` (1) (B1 sits about 6 dB under them), about 2 to 3 LU under the music they replace. Every pitched note is C major pentatonic and every layer is a texture, never a melody. Same lookahead scheduler as the music (0.6 s window, 100 ms tick).

| Floor | Layer | Synthesis |
| --- | --- | --- |
| L1 Lobby | Soft chime pad | Open pentatonic chords (three notes from six voicings) on an airy periodic-wave chime, swelling in about 1.8 s and ringing about 7 s, every 4 to 5.5 s, with an occasional high glint; lowpass 2.4 kHz into a lowpassed feedback echo |
| L2 Career | Warm analog pulse | A slow "lub dub" at 66 BPM: two detuned sawtooths (plus or minus 7 cents, a slow tape wow) under a closing lowpass, root and fifth over four bars (C, Am, G, Dsus), with rests and a tape echo |
| L3 Labs | Light electronic arpeggio | Short square plucks under a snapping lowpass, 0.3 s steps over four chords in 16 step phrases, about 30 percent rests and some quiet half phrases, with an echo |
| L4 Writing | Typewriter and paper | Band-passed noise ticks in word-like bursts, a soft E7 sine carriage bell and a return swish at line ends, and slow paper rustle swells from a looped noise bed |
| RF Roof | Wind and a distant beacon | Gusting band-passed noise (with a low body) as wind, and a high sine radio beacon (G6, A6, C7) sending short morse-like patterns, the last one spelling HQ |
| B1 Engine Room | Machine hum | Two detuned sawtooth pairs on C2 and G2 under a 180 Hz lowpass, a band-passed noise bed as air handling, and a soft G5 relay tick every 3 to 6 s. About 6 dB under the other layers (owner, 2026-10-18): `B1_HUM_LEVEL` is `FLOOR_TONE_PEAK` (L3's pluck peak, 0.05) times `B1_UNDER_FLOORS` (0.5), and the air bed and tick scale with it |

## Behavior

- **On by default.** A missing or invalid `hq:sound` value means on; only a stored `"off"` (the visitor muted) keeps it muted. The default is not written to storage; `setMuted` writes `"on"` / `"off"`.
- **Lazy engine.** The engine chunk loads on the first call that needs sound: only while the 3D view is unpaused (the Page View never loads it), on the first `pointerdown`, `touchstart`, `pointerup`, `keydown`, `touchend` or `click` there, or on a one-shot or a rover faster than 1 u/s once the page already had a user activation (`navigator.userActivation.hasBeenActive`, for example the click that opened the tower). Before it exists, the facade answers `isMuted`, `getSettings`, `isPaused` and `ambienceFloor` itself (from storage and what callers set), persists mute and settings changes at once (the engine reads them when it is created), and hands the pause state, the floor, the rumble speed and the one-shots requested while it loads (at most 4, each at most `QUEUED_SOUND_MAX_AGE_MS`, 1 s, old: later it would no longer read as feedback for its tap) to the engine when it arrives. `playCounts` counts every request, before and after. Subscribers of the facade see the engine's changes.
- **One context, started inside the gesture.** Safari starts an `AudioContext` only inside a gesture, and the chunk can arrive after it. So when a gesture (or an unmute, from a click or the `m` key) comes before the engine, the facade creates the one context and resumes it right there (`createContext`, once), and the engine adopts it (`started` dep: `createContext` returns that context and the engine builds its graph and starts the music at creation). A pause or a mute before the engine arrives suspends it; `dispose` closes it. The engine never creates a second one.
- **No idle warm-up.** The chunk is not fetched at idle in the 3D view: the measured 3D sessions have sound on and would then carry its 3.8 KB, over the session caps' headroom (about 1.7 KB); the gesture start above makes a slow chunk harmless instead.
- **Lazy init and first gesture.** No `AudioContext` exists until it is needed. Browser autoplay policy keeps any context suspended until a user activation, so while unmuted the engine listens (capture) for `pointerdown`, `pointerup`, `keydown`, `touchend` and `click` (on touch screens activation comes at the end of a tap, not `touchstart`). The first one creates the context, starts the background music and resumes it; the listeners stay until the context really runs. The engine is created when the 3D view first needs sound (see Lazy engine), so the Boot rover button or the first click, tap or key in the HQ starts the sound. Sounds requested before that gesture may be silent; this is expected.
- **Paused outside 3D.** The engine starts paused, so the Page View and the static tier never create a context, even after a click or a dialog sound. `Experience` unpauses on mount and pauses again on unmount; `setPaused(true)` fades out and suspends like a mute but keeps the setting.
- **Background music** (`src/lib/audio/music.ts`) is scheduled by a lookahead scheduler on `AudioContext.currentTime`: a 0.6 s window, woken every 100 ms; it skips missed steps after a stall and does nothing while the context is suspended. The reverb impulse is built once per context, off the first gesture (on a 0 ms timeout), and reused. Muting or pausing stops the music when the fade ends (every scheduled note cancelled, every node disconnected, the timer cleared); unmuting or unpausing starts a fresh one with a 2 s fade in. A hidden tab only suspends the context. The compressor sits on the music bus, so the effects are unchanged. Reduced motion does not affect audio.
- **Settings.** `hq:sfx`, `hq:music` and `hq:music-volume` are read when the engine is created and written on change. The master mute (`hq:sound`, key `m`) wins over all of them. The music voice feeds a `musicBus` gain (set to the volume) that feeds the master, so the volume never touches the effects. `setMusic(true)` while muted or paused only records the setting; the music starts on the next unmute or unpause. `setEffects(true)` restores the rumble speed only while audible.
- **Floor ambience** (`src/lib/audio/ambience.ts`) is a lazy chunk: the engine loads it with one cached `import("./ambience")` (the `loadAmbience` dep, injectable in tests) the first time it should sound, and checks again when it arrives (not muted, not paused, not disposed, ambience on, a floor set, context open, no voice yet). The voice feeds the `musicBus`, so the music volume scales it and the music toggle does not; it never touches the master gain or the effects path. **One soundtrack at a time:** while the ambience is on and a floor is set (also while the chunk is loading), the music does not start; when the voice starts or takes a floor, the music fades out over `SOUNDTRACK_CROSSFADE` (2 s, the same as `AMBIENCE_CROSSFADE`) and is stopped after it. Switching the ambience off, clearing the floor or a failed chunk load starts the music again (its own 2 s fade in). It stops where the music stops (after the mute or pause fade, in `dispose`) and starts where the music starts (unmute, unpause, the first gesture). Switching the setting off calls `voice.setFloor(null)` (a fade) and stops the voice after `AMBIENCE_CROSSFADE` plus 100 ms (or at once on a mute or dispose). A hidden tab only suspends.
- **Muting** fades the master bus (music and rumble included) over about 100 ms, then suspends the context. `play` is a no-op while muted; `setRumble` only remembers the speed.
- **Tab visibility.** Hidden suspends the context; visible resumes it only when unmuted.

## Integration notes (3D and HUD sessions)

- Rover: call `audio.setRumble(speed)` every frame or whenever the speed changes (manual max 9 u/s, autopilot 12 u/s). It is cheap and does nothing while muted.
- Elevator arrival: `audio.play("ding")`.
- Drawer open and close: `audio.play("whoosh")`.
- Mission chosen and terminal open: `audio.play("beep")`.
- Terminal typing: `audio.play("click")` once per typed character; the engine drops clicks beyond 20 per second.
- HUD sound toggle and the `m` key: `audio.toggleMuted()` (or `toggleMuted` from `useAudio()`).
- The zustand store `sound` flag can mirror the engine: `audio.subscribe(() => set({ sound: !audio.isMuted() }))`. Keep the engine as the source of truth so persistence stays in one place.
