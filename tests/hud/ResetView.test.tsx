// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { intents, type Intent } from "@/experience/input/intents";
import { ResetView, ViewControls } from "@/hud/ViewControls";

afterEach(cleanup);

describe("ResetView", () => {
  it("is a labelled group with one round 48 px reset button that resets the view", async () => {
    const emitted: Intent[] = [];
    const off = intents.on((i) => {
      emitted.push(i);
    });
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ResetView />
      </NextIntlClientProvider>,
    );
    const group = screen.getByRole("group", { name: en.hud.view.label });
    expect(group).toHaveAttribute("data-testid", "view-controls");
    expect(group).toHaveAttribute("data-onboard", "view");
    const buttons = group.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    const reset = screen.getByRole("button", { name: en.hud.view.reset });
    expect(reset).toHaveAttribute("data-testid", "view-reset");
    expect(reset).toHaveClass("size-12", "rounded-full");
    await userEvent.click(reset);
    expect(emitted).toEqual([{ type: "view", action: "reset" }]);
    off();
  });

  it("leaves the desktop view controls with rotate left, reset and rotate right", () => {
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ViewControls />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("view-controls").querySelectorAll("button")).toHaveLength(3);
  });
});
