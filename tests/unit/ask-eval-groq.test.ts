import { describe, expect, it } from "vitest";
import { groqSummary } from "../../scripts/ask-eval";

const row = (pass: boolean, ms: number, chars: number, prompt = 0, cached = 0, completion = 0) => ({ pass, ms, chars, usage: { prompt, cached, completion } });

describe("groqSummary", () => {
  it("counts passes, latency and means", () => {
    const s = groqSummary([row(true, 1000, 200, 3000, 0, 100), row(false, 3000, 400, 3000, 2000, 200), row(true, 2000, 300, 3000, 1000, 150)]);
    expect(s.passed).toBe(2);
    expect(s.total).toBe(3);
    expect(s.medianMs).toBe(2000);
    expect(s.maxMs).toBe(3000);
    expect(s.meanChars).toBe(300);
    expect(s.meanPrompt).toBe(3000);
    expect(s.meanCached).toBe(1000);
    expect(s.meanCompletion).toBe(150);
  });

  it("averages the two middle latencies for an even count", () => {
    expect(groqSummary([row(true, 1000, 1), row(true, 3000, 1), row(true, 2000, 1), row(true, 8000, 1)]).medianMs).toBe(2500);
  });

  it("estimates questions per day from uncached prompt plus completion tokens, capped by requests per day", () => {
    // (3000 - 1000 + 500) = 2500 tokens per question: 200000 / 2500 = 80.
    expect(groqSummary([row(true, 1, 1, 3000, 1000, 500)]).perDay).toBe(80);
    // Tiny questions hit the request cap.
    expect(groqSummary([row(true, 1, 1, 10, 0, 10)]).perDay).toBe(1000);
    expect(groqSummary([row(true, 1, 1, 3000, 1000, 500)], { tokensPerDay: 10_000, requestsPerDay: 1_000 }).perDay).toBe(4);
  });

  it("handles rows without usage and an empty run", () => {
    const s = groqSummary([{ pass: false, ms: 5, chars: 0 }]);
    expect(s.meanPrompt).toBe(0);
    expect(s.perDay).toBe(1000);
    const empty = groqSummary([]);
    expect(empty).toMatchObject({ passed: 0, total: 0, medianMs: 0, maxMs: 0, meanChars: 0 });
  });
});
