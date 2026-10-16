/**
 * Advance widths of the in-world Inter 400 cut (`public/fonts/3d/<INTER_400_FILE>`), in thousandths of
 * an em, for U+0020..U+007E then U+00A0..U+00FF; anything else counts 0.6 em. Pure: the L3 directory
 * boards measure list lines with it (one line per project), Vitest checks the fit in node.
 * Regenerate with fonttools when the cut changes (tests/unit/inter-width.test.ts pins the file): run the
 * generator script in docs/superpowers/plans/2026-10-16-l3-neat-entrance-symmetric-end.md, Task 1, Step 3.
 */
export const INTER_400_FILE = "inter-latin-400-normal.73c1b225.woff";
const ADVANCES =
  "281,288,466,633,642,982,644,300,365,365,501,662,288,460,288,360,631,407,610,618,646,593,620,566,619,620,288,302,662,662,662,511,966,690,654,730,722,601,590,746,743,269,571,672,565,903,753,765,639,765,644,642,646,744,690,985,682,679,629,365,360,365,471,456,323,562,612,571,612,583,370,613,591,242,242,549,242,876,591,600,612,612,376,528,327,591,562,818,546,562,552,426,333,426,662,281,288,571,611,725,550,270,568,591,914,454,583,662,600,666,478,456,662,442,446,323,586,603,288,268,304,482,583,802,847,882,511,690,690,690,690,690,690,994,730,601,601,601,601,269,269,269,269,735,753,765,765,765,765,765,662,765,744,744,744,744,679,636,616,562,562,562,562,562,562,917,571,583,583,583,583,242,242,242,242,583,591,600,600,600,600,600,662,600,591,591,591,591,562,612,562"
    .split(",")
    .map(Number);
const advance = (cp: number) =>
  cp >= 32 && cp <= 126
    ? ADVANCES[cp - 32]
    : cp >= 160 && cp <= 255
      ? ADVANCES[95 + cp - 160]
      : 600;

export function interWidth(text: string): number {
  let sum = 0;
  for (const ch of text) sum += advance(ch.codePointAt(0)!);
  return sum / 1000;
}
