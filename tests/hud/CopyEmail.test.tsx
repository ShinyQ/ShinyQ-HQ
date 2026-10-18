// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import { CopyEmail } from "@/components/page/CopyEmail";

const email = "hello+work@example.com";
const labels = { label: en.common.copyEmail, copied: en.common.copied, failed: en.common.emailCopyFailed };
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
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Classic CopyEmail", () => {
  for (const [locale, messages, failed] of [
    ["en", en, "Could not copy. Select and copy this email address."],
    ["id", id, "Alamat email belum bisa disalin. Pilih lalu salin alamat ini."],
  ] as const) {
    for (const unavailable of ["rejected", "missing"] as const) {
      it(`${locale}: offers selectable raw email when clipboard is ${unavailable}, leaving mailto usable`, async () => {
        if (unavailable === "missing") Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
        else writeText.mockRejectedValueOnce(new Error("blocked"));
        render(<><a href={`mailto:${email}`}>{email}</a><CopyEmail email={email} label={messages.common.copyEmail} copied={messages.common.copied} failed={messages.common.emailCopyFailed} /></>);
        const action = screen.getByRole("button", { name: messages.common.copyEmail });
        action.focus();
        fireEvent.click(action);
        const field = await screen.findByRole("textbox", { name: failed });
        expect(field).toHaveValue(email);
        expect(field).toHaveAttribute("readonly");
        expect(field).not.toBeDisabled();
        expect(field.tabIndex).toBe(0);
        expect(field.closest("button")).toBeNull();
        expect(action).toHaveFocus();
        expect(screen.getByRole("status")).toHaveTextContent(failed);
        expect(screen.queryByText(messages.common.copied)).toBeNull();
        expect(screen.getByRole("link", { name: email })).toHaveAttribute("href", `mailto:${email}`);
        if (unavailable === "rejected") expect(writeText).toHaveBeenCalledWith(email);
        field.focus();
        expect(field).toHaveFocus();
      });
    }
  }

  it("clears Indonesian failure at retry start and confirms only after a successful write", async () => {
    const localized = { label: id.common.copyEmail, copied: id.common.copied, failed: id.common.emailCopyFailed };
    writeText.mockRejectedValueOnce(new Error("blocked"));
    render(<CopyEmail email={email} {...localized} />);
    fireEvent.click(screen.getByRole("button", { name: localized.label }));
    await screen.findByRole("textbox", { name: localized.failed });
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole("button", { name: localized.label }));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    await act(async () => pending.resolve());
    expect(screen.getByRole("button", { name: "Tersalin" })).toBeInTheDocument();
  });

  it("keeps the raw attempted email when the prop changes before rejection", async () => {
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    const { rerender } = render(<CopyEmail email={email} {...labels} />);
    fireEvent.click(screen.getByRole("button", { name: labels.label }));
    expect(writeText).toHaveBeenCalledWith(email);
    rerender(<CopyEmail email="other@example.com" {...labels} />);
    await act(async () => pending.reject(new Error("blocked")));
    expect(screen.getByRole("textbox", { name: labels.failed })).toHaveValue(email);
  });

  it("clears stale success before retry, keeps failure, then restores the ordinary label after retry success", async () => {
    vi.useFakeTimers();
    render(<CopyEmail email={email} {...labels} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.label })));
    expect(screen.getByRole("button", { name: labels.copied })).toBeInTheDocument();
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    fireEvent.click(screen.getByRole("button", { name: labels.copied }));
    expect(screen.queryByText(labels.copied)).toBeNull();
    await act(async () => pending.reject(new Error("blocked")));
    await act(async () => vi.advanceTimersByTime(2500));
    expect(screen.getByRole("textbox", { name: labels.failed })).toHaveValue(email);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.label })));
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: labels.copied })).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(2000));
    expect(screen.getByRole("button", { name: labels.label })).toBeInTheDocument();
  });

  for (const olderResult of ["success", "failure"] as const) {
    it(`ignores an older ${olderResult} after a newer clipboard outcome`, async () => {
      const older = deferred();
      const newer = deferred();
      writeText.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
      const { rerender } = render(<CopyEmail email={email} {...labels} />);
      fireEvent.click(screen.getByRole("button", { name: labels.label }));
      rerender(<CopyEmail email="latest@example.com" {...labels} />);
      fireEvent.click(screen.getByRole("button", { name: labels.label }));
      if (olderResult === "success") {
        await act(async () => newer.reject(new Error("blocked")));
        await act(async () => older.resolve());
        expect(screen.getByRole("textbox", { name: labels.failed })).toHaveValue("latest@example.com");
        expect(screen.queryByText(labels.copied)).toBeNull();
      } else {
        await act(async () => newer.resolve());
        await act(async () => older.reject(new Error("blocked")));
        expect(screen.queryByRole("textbox")).toBeNull();
        expect(screen.getByRole("button", { name: labels.copied })).toBeInTheDocument();
      }
    });
  }

  it("restarts the success timer and cancels it on unmount", async () => {
    vi.useFakeTimers();
    const { unmount } = render(<CopyEmail email={email} {...labels} />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.label })));
    await act(async () => vi.advanceTimersByTime(1000));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: labels.copied })));
    await act(async () => vi.advanceTimersByTime(1000));
    expect(screen.getByRole("button", { name: labels.copied })).toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start a timer if the pending write succeeds after unmount", async () => {
    vi.useFakeTimers();
    const pending = deferred();
    writeText.mockReturnValueOnce(pending.promise);
    const { unmount } = render(<CopyEmail email={email} {...labels} />);
    fireEvent.click(screen.getByRole("button", { name: labels.label }));
    unmount();
    await act(async () => pending.resolve());
    expect(vi.getTimerCount()).toBe(0);
  });
});
