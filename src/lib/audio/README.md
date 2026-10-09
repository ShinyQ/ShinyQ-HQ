# Audio engine

Procedural Web Audio for ShinyQ HQ (appendix 05 section 5, owner adaptation: every sound is synthesized, there are no audio files). No dependencies, SSR safe, muted by default.

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
| `isMuted` | `() => boolean` | Current setting. |
| `subscribe` | `(listener: () => void) => () => void` | Called on mute changes. Shaped for `useSyncExternalStore`. |
| `dispose` | `() => void` | Removes document listeners and closes the context. |
| `useAudio` | `(engine?: AudioEngine) => { muted, setMuted, toggleMuted, play, setRumble }` | Client hook. Server render and hydration report `muted: true`. |

## Sounds

| Sound | Call | Length | Synthesis |
| --- | --- | --- | --- |
| Ambient hum | automatic while unmuted | loop | Detuned saws plus sine sub, lowpass with slow LFO, gain 0.06 |
| Rover beep | `play("beep")` | about 120 ms | Two square tones (1320 Hz then 1980 Hz) |
| Tread rumble | `setRumble(speed)` | loop | Looped brown noise through a lowpass; gain and cutoff follow speed |
| Elevator ding | `play("ding")` | about 550 ms | Inharmonic sine partials with exponential decay |
| Drawer whoosh | `play("whoosh")` | about 220 ms | Band-passed noise with a rising sweep |
| Key click | `play("click")` | about 25 ms | High-passed noise burst, rate limited to 20 per second (extras dropped) |

## Behavior

- **Muted by default.** A missing or invalid `hq:sound` value means muted.
- **Lazy init.** No `AudioContext` exists until it is needed while unmuted. Call `setMuted(false)` from a user gesture (click, key press) so the browser lets the context start.
- **Persisted "on".** When storage already says `"on"`, the engine reports unmuted immediately, but browser autoplay policy keeps any context suspended until a user gesture. The engine therefore creates the context lazily on the first `play`, `setRumble` above 1 u/s, or `setMuted` call, and also registers a one-time `pointerdown` / `keydown` / `touchstart` listener (capture) that creates and resumes the context on the first interaction. Sounds requested before that gesture may be silent; this is expected.
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
