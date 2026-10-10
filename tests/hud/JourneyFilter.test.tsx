// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { JourneyFilter } from "@/components/page/JourneyFilter";

function renderJourney() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <JourneyFilter counts={{ all: 3, job: 2, freelance: 0, education: 0, award: 1, milestone: 0 }}>
        <ol>
          <li data-year="2024" data-testid="y2024">
            <ul>
              <li data-entry data-type="job">
                Job 2024
              </li>
              <li data-entry data-type="award">
                Award 2024
              </li>
            </ul>
          </li>
          <li data-year="2023" data-testid="y2023">
            <ul>
              <li data-entry data-type="job">
                Job 2023
              </li>
            </ul>
          </li>
        </ol>
      </JourneyFilter>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => window.history.replaceState(null, "", "/en/journey?tier=static"));
afterEach(cleanup);

describe("JourneyFilter", () => {
  it("shows one entry type and hides years left empty", async () => {
    const user = userEvent.setup();
    renderJourney();
    await user.click(screen.getByRole("button", { name: /^Awards/ }));
    expect(screen.getByRole("button", { name: /^Awards/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Job 2024")).not.toBeVisible();
    expect(screen.getByText("Award 2024")).toBeVisible();
    expect(screen.getByTestId("y2023")).not.toBeVisible();
    expect(window.location.search).toBe("?tier=static&type=award");
    await user.click(screen.getByRole("button", { name: /^All/ }));
    expect(screen.getByText("Job 2023")).toBeVisible();
    expect(window.location.search).toBe("?tier=static");
  });

  it("disables types without entries", () => {
    renderJourney();
    expect(screen.getByRole("button", { name: /^Education/ })).toBeDisabled();
  });
});
