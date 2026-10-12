// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { joystick, setBoost } from "@/experience/input/joystick";
import { BoostButton } from "@/hud/BoostButton";

function renderButton() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <BoostButton />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  setBoost(false);
});

describe("BoostButton", () => {
  it("boosts while held and stops on release or cancel", () => {
    renderButton();
    const button = screen.getByTestId("boost");
    expect(button).toHaveAttribute("aria-hidden", "true");
    expect(button).toHaveTextContent(en.hud.boost);
    fireEvent.pointerDown(button);
    expect(joystick.boost).toBe(true);
    expect(button).toHaveAttribute("data-active", "true");
    fireEvent.pointerUp(button);
    expect(joystick.boost).toBe(false);
    expect(button).not.toHaveAttribute("data-active");
    fireEvent.pointerDown(button);
    fireEvent.pointerCancel(button);
    expect(joystick.boost).toBe(false);
  });

  it("never leaves the boost on when it unmounts while held", () => {
    const { unmount } = renderButton();
    fireEvent.pointerDown(screen.getByTestId("boost"));
    expect(joystick.boost).toBe(true);
    unmount();
    expect(joystick.boost).toBe(false);
  });
});
