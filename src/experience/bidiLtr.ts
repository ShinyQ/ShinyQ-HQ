/**
 * Left-to-right stand-in for `bidi-js` (troika's Unicode bidirectional algorithm, about 5 KB gzip on the 3D first-frame
 * path), aliased in `next.config.ts`. Every in-world string is English or Indonesian, so every character sits at
 * embedding level 0: no reordered runs and no mirrored glyphs, exactly what bidi-js returns for left-to-right text.
 * Self-contained on purpose: troika serializes its typesetter dependencies when it runs them in a worker.
 * `tests/unit/bidi-ltr.test.ts` checks it against bidi-js and that the content has no right-to-left script.
 */
export default function bidiFactory() {
  return {
    getEmbeddingLevels(text: string) {
      return { levels: new Uint8Array(text.length), paragraphs: [{ start: 0, end: text.length - 1, level: 0 }] };
    },
    getReorderSegments(): [number, number][] {
      return [];
    },
    getMirroredCharacter(): string | null {
      return null;
    },
  };
}
