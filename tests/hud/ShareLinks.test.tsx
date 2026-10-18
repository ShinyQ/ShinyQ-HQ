// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { ShareLinks } from "@/components/ShareLinks";
import { SITE_URL } from "@/lib/site";

const labels = {
  group: en.common.share,
  classic: en.common.copyClassicLink,
  threeD: en.common.copy3dLink,
  copied: en.common.linkCopied,
  failed: en.common.linkCopyFailed,
};

const writeText = vi.fn<(value: string) => Promise<void>>();
const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  history.replaceState(null, "", "/en/labs/clearbox?view=classic");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("ShareLinks", () => {
  it("renders a labelled group with two buttons named by their visible label", () => {
    render(<ShareLinks variant="page" labels={labels} />);
    const group = screen.getByRole("group", { name: "Share" });
    expect(group).toContainElement(screen.getByRole("button", { name: "Copy Classic site link" }));
    expect(group).toContainElement(screen.getByRole("button", { name: "Copy 3D link" }));
  });

  it("copies the Classic link and confirms in place", async () => {
    render(<ShareLinks variant="page" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy Classic site link" }));
    expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/en/labs/clearbox?view=classic`);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Copy 3D link" })).toBeInTheDocument();
  });

  it("copies the 3D link without the view parameter", async () => {
    render(<ShareLinks variant="page" labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy 3D link" }));
    expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/en/labs/clearbox`);
    expect(await screen.findByText("Link copied")).toBeInTheDocument();
  });

  it("renders list items for the drawer menu variant", () => {
    render(
      <ul>
        <ShareLinks variant="menu" itemClassName="item" labels={labels} />
      </ul>,
    );
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Copy Classic site link" })).toHaveClass("item");
  });

  for (const variant of ["page", "menu"] as const) {
    for (const [locale, messages, failed] of [
      ["en", en, "Could not copy. Select and copy this link."],
      ["id", id, "Tautan belum bisa disalin. Pilih lalu salin tautan ini."],
    ] as const) {
      for (const unavailable of ["rejected", "missing"] as const) {
        it(`${variant}/${locale}: exposes the exact 3D post target when clipboard is ${unavailable}`, async () => {
          const localized = { group: messages.common.share, classic: messages.common.copyClassicLink, threeD: messages.common.copy3dLink, copied: messages.common.linkCopied, failed: messages.common.linkCopyFailed };
          history.replaceState(null, "", `/${locale}/blog/example?view=classic&other=1#section`);
          if (unavailable === "missing") Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
          else writeText.mockRejectedValueOnce(new Error("blocked"));
          render(variant === "menu"
            ? <ul><ShareLinks variant={variant} labels={localized} /></ul>
            : <ShareLinks variant={variant} labels={localized} />);
          const action = screen.getByRole("button", { name: localized.threeD });
          action.focus();
          fireEvent.click(action);
          const field = await screen.findByRole("textbox", { name: failed });
          expect(screen.getByRole("status")).toHaveTextContent(failed);
          expect(field).toHaveValue(`${SITE_URL}/${locale}/library`);
          expect(field).toHaveAttribute("readonly");
          expect(field).not.toBeDisabled();
          expect(field.tabIndex).toBe(0);
          expect(action).toHaveFocus();
          expect(screen.queryByText(localized.copied)).toBeNull();
          expect(screen.getByRole("button", { name: localized.classic })).toBeInTheDocument();
          if (unavailable === "rejected") expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/${locale}/library`);
          if (variant === "menu") {
            expect(field.closest("li")).toContainElement(action);
            expect(screen.getByRole("list").children).toHaveLength(2);
            expect([...screen.getByRole("list").children].every((child) => child.tagName === "LI")).toBe(true);
          } else {
            expect(screen.getByRole("group", { name: localized.group })).toContainElement(field);
            expect(field.closest("button")).toBeNull();
          }
          field.focus();
          expect(field).toHaveFocus();
        });
      }
    }
  }

  it("exposes the exact Classic target with its hash, not the address bar or a 3D link", async () => {
    history.replaceState(null, "", "/id/labs/example?view=architecture&other=1#flow");
    writeText.mockRejectedValueOnce(new Error("blocked"));
    render(<ShareLinks labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: labels.classic }));
    expect(await screen.findByRole("textbox", { name: labels.failed })).toHaveValue(`${SITE_URL}/id/labs/example?view=classic#flow`);
    expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/id/labs/example?view=classic#flow`);
  });

  for (const variant of ["page", "menu"] as const) {
    it(`${variant}: an Indonesian retry clears recovery at attempt start and announces success`, async () => {
      const localized = { group: id.common.share, classic: id.common.copyClassicLink, threeD: id.common.copy3dLink, copied: id.common.linkCopied, failed: id.common.linkCopyFailed };
      writeText.mockRejectedValueOnce(new Error("blocked"));
      render(variant === "menu" ? <ul><ShareLinks variant={variant} labels={localized} /></ul> : <ShareLinks labels={localized} />);
      fireEvent.click(screen.getByRole("button", { name: localized.classic }));
      await screen.findByRole("textbox", { name: localized.failed });
      const pending = deferred();
      writeText.mockReturnValueOnce(pending.promise);
      fireEvent.click(screen.getByRole("button", { name: localized.classic }));
      expect(screen.queryByRole("textbox")).toBeNull();
      expect(screen.queryByRole("status")).toBeNull();
      await act(async () => pending.resolve());
      expect(screen.getByRole("button", { name: "Tautan disalin" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: localized.threeD })).toBeInTheDocument();
    });
  }

  it("captures the attempted architecture target before a pending write and a location change", async () => {
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    history.replaceState(null, "", "/id/labs/example?other=1&view=architecture#flow");
    render(<ShareLinks labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: labels.threeD }));
    expect(writeText).toHaveBeenCalledWith(`${SITE_URL}/id/labs/example?view=architecture#flow`);
    history.replaceState(null, "", "/en/contact");
    await act(async () => pending.reject(new Error("blocked")));
    expect(screen.getByRole("textbox", { name: labels.failed })).toHaveValue(`${SITE_URL}/id/labs/example?view=architecture#flow`);
  });

  it("clears a previous success at retry start, persists failure, then removes recovery after success", async () => {
    vi.useFakeTimers();
    render(<ShareLinks labels={labels} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.classic })));
    expect(screen.getByRole("button", { name: labels.copied })).toBeInTheDocument();
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole("button", { name: labels.threeD }));
    expect(screen.queryByText(labels.copied)).toBeNull();
    await act(async () => pending.reject(new Error("blocked")));
    await act(async () => vi.advanceTimersByTime(2500));
    expect(screen.getByRole("textbox", { name: labels.failed })).toHaveValue(`${SITE_URL}/en/labs/clearbox`);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.threeD })));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: labels.copied })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: labels.threeD })).toBeInTheDocument();
  });

  for (const olderResult of ["success", "failure"] as const) {
    it(`ignores an older ${olderResult} after a newer clipboard outcome`, async () => {
      const older = deferred();
      const newer = deferred();
      writeText.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
      render(<ShareLinks labels={labels} />);
      fireEvent.click(screen.getByRole("button", { name: labels.classic }));
      fireEvent.click(screen.getByRole("button", { name: labels.threeD }));
      if (olderResult === "success") {
        await act(async () => newer.reject(new Error("blocked")));
        await act(async () => older.resolve());
        expect(screen.getByRole("textbox", { name: labels.failed })).toHaveValue(`${SITE_URL}/en/labs/clearbox`);
        expect(screen.queryByText(labels.copied)).toBeNull();
      } else {
        await act(async () => newer.resolve());
        await act(async () => older.reject(new Error("blocked")));
        expect(screen.queryByRole("textbox")).toBeNull();
        expect(within(screen.getByRole("group")).getByRole("button", { name: labels.copied })).toBeInTheDocument();
      }
    });
  }

  it("resets the success timer for another attempt and cleans it on unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<ShareLinks labels={labels} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.classic })));
    await act(async () => vi.advanceTimersByTime(1000));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.copied })));
    await act(async () => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("button", { name: labels.copied })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a feedback timer when a pending attempt finishes after unmount", async () => {
    vi.useFakeTimers();
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    const { unmount } = render(<ShareLinks labels={labels} />);
    fireEvent.click(screen.getByRole("button", { name: labels.classic }));
    unmount();
    await act(async () => pending.resolve());
    expect(vi.getTimerCount()).toBe(0);
  });
});
