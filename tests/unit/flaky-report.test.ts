import { describe, expect, it } from "vitest";
import { errorLine, flakyMarkdown, flakyTests, type JsonReport } from "../../scripts/flaky-report";

const ESC = String.fromCharCode(27);

/** Shaped like `playwright merge-reports --reporter json` for CI run 38564886707 (one flaky test). */
const report: JsonReport = {
  stats: { expected: 416, skipped: 66, unexpected: 0, flaky: 1 },
  suites: [
    {
      title: "camera.spec.ts",
      specs: [{ title: "top level passes", file: "camera.spec.ts", line: 10, tests: [{ status: "expected", results: [{ status: "passed", duration: 1000 }] }] }],
      suites: [
        {
          title: "wheel zoom and first person",
          specs: [
            {
              title: "the ! hints and Rover's dialog show in first person",
              file: "camera.spec.ts",
              line: 288,
              tests: [
                {
                  status: "flaky",
                  results: [
                    {
                      status: "failed",
                      duration: 35396,
                      retry: 0,
                      error: { message: `Error: ${ESC}[2mexpect(${ESC}[22mlocator).toBeVisible() failed\n\nLocator: getByTestId('hint-bubble')\nExpected: visible` },
                    },
                    { status: "passed", duration: 22319, retry: 1 },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      title: "hud.spec.ts",
      specs: [{ title: "a | pipe", file: "hud.spec.ts", line: 5, tests: [{ status: "flaky", results: [{ status: "timedOut", duration: 60000 }, { status: "passed", duration: 4000 }] }] }],
    },
  ],
};

describe("flaky report", () => {
  it("lists only tests that passed on a retry, with the describe path and both attempts", () => {
    const flaky = flakyTests(report);
    expect(flaky).toEqual([
      {
        file: "camera.spec.ts",
        line: 288,
        title: "wheel zoom and first person › the ! hints and Rover's dialog show in first person",
        attempts: [
          { status: "failed", seconds: 35.4, error: "Error: expect(locator).toBeVisible() failed; Locator: getByTestId('hint-bubble')" },
          { status: "passed", seconds: 22.3, error: "" },
        ],
      },
      { file: "hud.spec.ts", line: 5, title: "a | pipe", attempts: [{ status: "timedOut", seconds: 60, error: "" }, { status: "passed", seconds: 4, error: "" }] },
    ]);
  });

  it("renders a job summary table, escaping pipes", () => {
    const md = flakyMarkdown(flakyTests(report), "E2E", report);
    expect(md).toContain("2 flaky of 417 tests that ran");
    expect(md).toContain("| `camera.spec.ts:288` wheel zoom and first person › the ! hints and Rover's dialog show in first person | 35.4 s: Error: expect(locator).toBeVisible() failed; Locator: getByTestId('hint-bubble') | 22.3 s |");
    expect(md).toContain("| `hud.spec.ts:5` a \\| pipe | 60 s: timedOut | 4 s |");
  });

  it("says none when every test passed first time", () => {
    expect(flakyMarkdown([], "E2E", { suites: [], stats: { expected: 3, unexpected: 0, flaky: 0 } })).toBe("### E2E: tests that passed only on retry\n\nNone (3 tests ran).\n");
  });

  it("keeps error lines short and free of terminal colours", () => {
    expect(errorLine(`${ESC}[31m${"x".repeat(200)}${ESC}[39m`)).toHaveLength(160);
    expect(errorLine(undefined)).toBe("");
  });
});
