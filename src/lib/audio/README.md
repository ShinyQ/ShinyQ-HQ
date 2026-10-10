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
| `setMuted` | `(muted: boolean) => void` | Persists `"on"` / `"off"` in `localStorage["hq:sound"]`. The first unmute creates the `AudioContext`, resumes it and starts the ambient hum. |
| `toggleMuted` | `() => void` | Same as `setMuted(!isMuted())`. |
| `setPaused` | `(paused: boolean) => void` | Silences everything while the 3D view is closed (Page View) without touching the stored setting. `Experience` pauses on unmount and unpauses on mount. |
| `isPaused` | `() => boolean` | Current pause state. |
| `isMuted` | `() => boolean` | Current setting. |
| `subscribe` | `(listener: () => void) => () => void` | Called on mute changes. Shaped for `useSyncExternalStore`. |
| `dispose` | `() => void` | Removes document listeners and closes the context. |
| `useAudio` | `(engine?: AudioEngine) => { muted, setMuted, toggleMuted, play, setRumble }` | Client hook. Server render and hydration report `muted: true`. |

## Sounds

| Sound | Call | Length | Synthesis |
| --- | --- | --- | --- |
| Ambient hum | automatic while unmuted | loop | Detuned saws plus sine sub, lowpass with slow LFO, gain 0.04 |
| Rover beep | `play("beep")` | about 120 ms | Two square tones (1320 Hz then 1980 Hz) |
| Tread rumble | `setRumble(speed)` | loop | Looped brown noise through a lowpass; gain and cutoff follow speed |
| Elevator ding | `play("ding")` | about 550 ms | Inharmonic sine partials with exponential decay |
| Drawer whoosh | `play("whoosh")` | about 220 ms | Band-passed noise with a rising sweep |
| Key click | `play("click")` | about 25 ms | High-passed noise burst, rate limited to 20 per second (extras dropped) |

## Behavior

- **On by default.** A missing or invalid `hq:sound` value means on; only a stored `"off"` (the visitor muted) keeps it muted. The default is not written to storage; `setMuted` writes `"on"` / `"off"`.
- **Lazy init and first gesture.** No `AudioContext` exists until it is needed. Browser autoplay policy keeps any context suspended until a user activation, so while unmuted the engine listens (capture) for `pointerdown`, `pointerup`, `keydown`, `touchend` and `click` (on touch screens activation comes at the end of a tap, not `touchstart`). The first one creates the context, starts the ambient hum and resumes it; the listeners stay until the context really runs. The engine is created when `Experience` mounts, so the Boot rover button or the first click, tap or key in the HQ starts the sound. Sounds requested before that gesture may be silent; this is expected.
- **Paused outside 3D.** `setPaused(true)` fades out and suspends like a mute but keeps the setting; `Experience` pauses on unmount (Page View) and unpauses on mount. The static tier never creates the engine.
- **Muting** fades the master bus (ambient and rumble included) over about 100 ms, then suspends the context. `play` is a no-op while muted; `setRumble` only remembers the speed.
- **Tab visibility.** Hidden suspends the context; visible resumes it only when unmuted.

## Integration notes (3D and HUD sessions)

- Rover: call `audio.setRumble(speed)` every frame or whenever the speed changes (manual max 9 u/s, autopilot 12 u/s). It is cheap and does nothing while muted.
- Elevator arrival: `audio.play("ding")`.
- Drawer open and close: `audio.play("whoosh")`.
- Mission chosen and terminal open: `audio.play("beep")`.
- Terminal typing: `audio.play("click")` once per typed character; the engine drops clicks beyond 20 per second.
- HUD sound toggle and the `m` key: `audio.toggleMuted()` (or `toggleMuted` from `useAudio()`).
- The zustand store `sound` flag can mirror the engine: `audio.subscribe(() => set({ sound: !audio.isMuted() }))`. Keep the engine as the source of truth so persistence stays in one place.
