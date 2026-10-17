# Audio engine

Procedural Web Audio for ShinyQ HQ (appendix 05 section 5, owner adaptation: every sound is synthesized, there are no audio files). No dependencies, SSR safe, on by default (the visitor's mute is persisted and always respected).

```ts
import { audio, useAudio } from "@/lib/audio";
```

## API

| Member | Signature | Notes |
| --- | --- | --- |
| `audio` | `AudioEngine` | Lazy singleton proxy. Importing creates nothing; the real engine is built on the first method call. |
| `createAudioEngine` | `(deps?: Partial<AudioEngineDeps>) => AudioEngine` | For tests or isolated instances. Deps: `createContext`, `storage`, `doc`, `now`. |
| `play` | `(name: SoundName) => void` | `"beep" \| "ding" \| "whoosh" \| "click"`. No-op while muted. |
| `setRumble` | `(speed: number) => void` | Rover speed in u/s. At or below 1 is silent, clamps at 12. Gain and cutoff glide with `setTargetAtTime`. |
| `setMuted` | `(muted: boolean) => void` | Persists `"on"` / `"off"` in `localStorage["hq:sound"]`. The first unmute creates the `AudioContext`, resumes it and starts the background music. |
| `toggleMuted` | `() => void` | Same as `setMuted(!isMuted())`. |
| `setPaused` | `(paused: boolean) => void` | Silences everything while the 3D view is closed (Page View) without touching the stored setting. `Experience` pauses on unmount and unpauses on mount. |
| `isPaused` | `() => boolean` | Current pause state. |
| `isMuted` | `() => boolean` | Current setting. |
| `getSettings` | `() => AudioSettings` | `{ effects, music, musicVolume }`. The same object until a setting changes (stable for `useSyncExternalStore`). |
| `setEffects` | `(on: boolean) => void` | Persists `localStorage["hq:sfx"]` (`"off"` disables, missing is on). Off makes `play` a no-op and keeps the rumble silent. |
| `setMusic` | `(on: boolean) => void` | Persists `localStorage["hq:music"]` (`"off"` disables, missing is on). Off stops the music voice at once; on starts a fresh one when audible. |
| `setMusicVolume` | `(volume: number) => void` | Clamped 0 to 1, persisted in `localStorage["hq:music-volume"]` (missing is 1). Glides the music bus with `setTargetAtTime` (time constant 0.05). |
| `subscribe` | `(listener: () => void) => () => void` | Called on mute and setting changes. Shaped for `useSyncExternalStore`. |
| `dispose` | `() => void` | Removes document listeners and closes the context. |
| `useAudio` | `(engine?: AudioEngine) => { muted, setMuted, toggleMuted, play, setRumble }` | Client hook. Server render and hydration report `muted: true`. |
| `useAudioSettings` | `(engine?: AudioEngine) => AudioSettings` | Client hook for the Settings panel. Server render reports `{ effects: true, music: true, musicVolume: 1 }`. |

## Sounds

| Sound | Call | Length | Synthesis |
| --- | --- | --- | --- |
| Background music: "Deep Space Ambient" | automatic while unmuted | endless, never repeats exactly | Three triangle drones (MIDI 36, 43, 48) through a 600 Hz lowpass; every 0.5 s a 35 percent chance of a C major pentatonic glass bell (sine, 2.6 s decay, plus a 2.01x partial); 3 s synthetic convolution reverb at 60 percent wet and a compressor on the music bus; output trim 0.6 (the site's ambient level, quiet enough that the effects stay on top) |
| Rover beep | `play("beep")` | about 120 ms | Two square tones (1320 Hz then 1980 Hz) |
| Tread rumble | `setRumble(speed)` | loop | Looped brown noise through a lowpass; gain and cutoff follow speed |
| Elevator ding | `play("ding")` | about 550 ms | Inharmonic sine partials with exponential decay |
| Drawer whoosh | `play("whoosh")` | about 220 ms | Band-passed noise with a rising sweep |
| Key click | `play("click")` | about 25 ms | High-passed noise burst, rate limited to 20 per second (extras dropped) |

## Behavior

- **On by default.** A missing or invalid `hq:sound` value means on; only a stored `"off"` (the visitor muted) keeps it muted. The default is not written to storage; `setMuted` writes `"on"` / `"off"`.
- **Lazy init and first gesture.** No `AudioContext` exists until it is needed. Browser autoplay policy keeps any context suspended until a user activation, so while unmuted the engine listens (capture) for `pointerdown`, `pointerup`, `keydown`, `touchend` and `click` (on touch screens activation comes at the end of a tap, not `touchstart`). The first one creates the context, starts the background music and resumes it; the listeners stay until the context really runs. The engine is created when `Experience` mounts, so the Boot rover button or the first click, tap or key in the HQ starts the sound. Sounds requested before that gesture may be silent; this is expected.
- **Paused outside 3D.** The engine starts paused, so the Page View and the static tier never create a context, even after a click or a dialog sound. `Experience` unpauses on mount and pauses again on unmount; `setPaused(true)` fades out and suspends like a mute but keeps the setting.
- **Background music** (`src/lib/audio/music.ts`) is scheduled by a lookahead scheduler on `AudioContext.currentTime`: a 0.6 s window, woken every 100 ms; it skips missed steps after a stall and does nothing while the context is suspended. The reverb impulse is built once per context, off the first gesture (on a 0 ms timeout), and reused. Muting or pausing stops the music when the fade ends (every scheduled note cancelled, every node disconnected, the timer cleared); unmuting or unpausing starts a fresh one with a 2 s fade in. A hidden tab only suspends the context. The compressor sits on the music bus, so the effects are unchanged. Reduced motion does not affect audio.
- **Settings.** `hq:sfx`, `hq:music` and `hq:music-volume` are read when the engine is created and written on change. The master mute (`hq:sound`, key `m`) wins over all of them. The music voice feeds a `musicBus` gain (set to the volume) that feeds the master, so the volume never touches the effects. `setMusic(true)` while muted or paused only records the setting; the music starts on the next unmute or unpause. `setEffects(true)` restores the rumble speed only while audible.
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
