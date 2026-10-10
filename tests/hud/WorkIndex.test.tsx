// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import en from "../../messages/en.json";
import { WorkIndex } from "@/components/page/WorkIndex";
import { podAttrs } from "@/content/pageview";

const pods = [
  { slug: "a", wing: "ai" as const, stack: ["FastAPI", "Azure OpenAI"] },
  { slug: "b", wing: "software" as const, stack: ["Node.js"] },
  { slug: "c", wing: "ai" as const, stack: ["Next.js", "Node.js"] },
];

function renderIndex() {
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      <WorkIndex pods={pods}>
        <ul data-pod-block>
          {pods.map((p) => (
            <li key={p.slug} {...podAttrs(p)}>
              Pod {p.slug}
            </li>
          ))}
        </ul>
      </WorkIndex>
    </NextIntlClientProvider>,
  );
}

beforeEach(() => window.history.replaceState(null, "", "/en/labs?tier=static"));
afterEach(cleanup);

describe("WorkIndex", () => {
  it("filters by wing, then by stack, and keeps other params in the URL", async () => {
    const user = userEvent.setup();
    renderIndex();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 3 of 3");
    await user.click(screen.getByRole("button", { name: /^AI/ }));
    expect(screen.getByRole("button", { name: /^AI/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Pod b")).not.toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 2 of 3");
    expect(window.location.search).toBe("?tier=static&wing=ai");

    await user.selectOptions(screen.getByRole("combobox", { name: "Stack" }), "Node.js");
    expect(screen.getByText("Pod a")).not.toBeVisible();
    expect(screen.getByText("Pod c")).toBeVisible();
    expect(window.location.search).toBe("?tier=static&wing=ai&stack=Node.js");
  });

  it("shows an empty state that clears the filters", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/en/labs?wing=software&stack=FastAPI");
    renderIndex();
    expect(await screen.findByText("No projects match these filters.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Showing 0 of 3");
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    for (const slug of ["a", "b", "c"]) expect(screen.getByText(`Pod ${slug}`)).toBeVisible();
    expect(window.location.search).toBe("");
  });
});
