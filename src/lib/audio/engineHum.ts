/**
 * The B1 hum's gain node while its ambience layer plays (`level` is its resting gain), set and cleared by that layer
 * in `ambience.ts`, so the B1 chunk can swell it near the reactor without importing the lazy ambience chunk.
 */
export const engineHum: { node: GainNode | null; level: number } = { node: null, level: 0 };
