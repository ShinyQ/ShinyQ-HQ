// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { buildExperienceData } from "@/content/experience";
import { ProfileCard } from "@/hud/ProfileCard";
import { getHQStore } from "@/store/useHQStore";
import { brandPhotoSrc } from "@/lib/brand-photo";

const data = buildExperienceData("en", { L1: "Home", L2: "Journey", L3: "Work", L4: "Writing", RF: "About" });

afterEach(cleanup);

describe("ProfileCard", () => {
  it("shows the floor but no rooms-visited counter or progress bar, and keeps visited rooms in the store", () => {
    getHQStore().setState({ floor: "L1", visited: ["L1:skills", "L1:stats"] });
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ProfileCard data={data} />
      </NextIntlClientProvider>,
    );
    const card = screen.getByRole("region", { name: en.hud.profile });
    expect(card).toHaveTextContent("Home");
    expect(card).not.toHaveTextContent(/\d+\s*\/\s*\d+/);
    expect(card).not.toHaveTextContent(/visited/i);
    expect(card.querySelector("[aria-hidden='true'].rounded-full")).toBeNull();
    expect(getHQStore().getState().visited).toEqual(["L1:skills", "L1:stats"]);
  });

  it("shows the owner's round photo instead of the KAW monogram, decorative and with a fixed size", () => {
    getHQStore().setState({ floor: "L3" });
    render(
      <NextIntlClientProvider locale="en" messages={en}>
        <ProfileCard data={data} />
      </NextIntlClientProvider>,
    );
    const badge = screen.getByTestId("profile-photo");
    const img = badge.querySelector("img")!;
    expect(img).toHaveAttribute("src", brandPhotoSrc(160));
    expect(img.getAttribute("srcset")).toContain(`${brandPhotoSrc(320)} 320w`);
    expect(img).toHaveAttribute("sizes", "44px");
    expect(img).toHaveAttribute("alt", "");
    expect(img).toHaveAttribute("width", "40");
    expect(img).toHaveAttribute("height", "40");
    expect(screen.getByRole("region", { name: en.hud.profile }).querySelector("svg text")).toBeNull();
  });
});
