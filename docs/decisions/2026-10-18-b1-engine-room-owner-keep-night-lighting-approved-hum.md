# B1 Engine Room

- Date: 2026-10-18
- PR: [#209](https://github.com/ShinyQ/ShinyQ-HQ/pull/209)

Owner: "Keep the night lighting (approved)" and "Hum level about 6 dB under the floor layers". The B1 night lighting stays as built. The B1 layer (hum, air bed and relay tick) drops to half the amplitude of the other floor layers' tonal level (`B1_HUM_LEVEL = FLOOR_TONE_PEAK * 0.5`, 0.05 to 0.025), and like them it replaces Deep Space Ambient while it plays (#199).
