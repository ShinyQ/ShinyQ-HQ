// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lazy, Suspense, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogHost } from "@/components/DialogHost";
import type { CertView } from "@/content/certs";
import { openCert, sendHudCommand } from "@/hud/events";

vi.mock("@/lib/audio", () => ({ audio: { play: vi.fn() } }));
vi.mock("next/dynamic", () => ({
  default: (load: () => Promise<{ default: ComponentType<Record<string, unknown>> }>) => {
    const Lazy = lazy(load);
    return function Dynamic(props: Record<string, unknown>) {
      return (
        <Suspense fallback={null}>
          <Lazy {...props} />
        </Suspense>
      );
    };
  },
}));
// Stand-ins for the lazy dialog chunks: the cert card's action is a `[data-hq-guide]` button, as in the real CertDialog.
vi.mock("@/components/dialog-loaders", () => ({
  loadCvDialog: async () => ({ default: () => null }),
  loadPaperDialog: async () => ({ default: () => null }),
  loadCertDialog: async () => ({
    default: ({ cert }: { cert: CertView }) => (
      <button type="button" data-testid="cert-read" data-hq-guide={cert.guide ?? ""}>
        Read study guide
      </button>
    ),
  }),
}));
vi.mock("@/components/guides/GuideDialog", () => ({
  default: ({ slug, onClose }: { slug: string; onClose: () => void }) => (
    <button type="button" data-testid="guide-close" data-slug={slug} onClick={onClose}>
      Close
    </button>
  ),
}));

afterEach(cleanup);

const cert = { id: "aws-saa", guide: "aws-saa" } as CertView;

describe("DialogHost", () => {
  it("opens a guide from the open cert card and returns focus to the cert card's opener", async () => {
    render(
      <>
        <button type="button" data-testid="opener">
          AWS SAA
        </button>
        <DialogHost />
      </>,
    );
    const opener = screen.getByTestId("opener");
    opener.focus();
    act(() => openCert(cert));
    const read = await screen.findByTestId("cert-read");
    read.focus();
    fireEvent.click(read);
    const close = await screen.findByTestId("guide-close");
    expect(close).toHaveAttribute("data-slug", "aws-saa");
    expect(screen.queryByTestId("cert-read")).toBeNull();
    fireEvent.click(close);
    await waitFor(() => expect(screen.queryByTestId("guide-close")).toBeNull());
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("opens a guide on its own and returns focus to its opener", async () => {
    render(
      <>
        <button type="button" data-testid="opener">
          Read
        </button>
        <DialogHost />
      </>,
    );
    const opener = screen.getByTestId("opener");
    opener.focus();
    act(() => sendHudCommand({ type: "guide", slug: "gcp-pca" }));
    const close = await screen.findByTestId("guide-close");
    expect(close).toHaveAttribute("data-slug", "gcp-pca");
    close.focus();
    fireEvent.click(close);
    await waitFor(() => expect(opener).toHaveFocus());
  });

  it("opens a guide from a delegated click on a server-rendered [data-hq-guide] button and returns focus to it", async () => {
    render(
      <>
        <button type="button" data-hq-guide="az-104" data-testid="guide-read">
          Read <span data-testid="label">: AZ-104</span>
        </button>
        <DialogHost />
      </>,
    );
    const read = screen.getByTestId("guide-read");
    // A click on the button's inner text still finds the button; the opener is the button even without focus (Safari).
    fireEvent.click(screen.getByTestId("label"));
    const close = await screen.findByTestId("guide-close");
    expect(close).toHaveAttribute("data-slug", "az-104");
    close.focus();
    fireEvent.click(close);
    await waitFor(() => expect(screen.queryByTestId("guide-close")).toBeNull());
    await waitFor(() => expect(read).toHaveFocus());
  });

  it("ignores clicks outside [data-hq-guide] buttons", async () => {
    render(
      <>
        <button type="button" data-testid="other">
          Other
        </button>
        <DialogHost />
      </>,
    );
    fireEvent.click(screen.getByTestId("other"));
    await act(async () => {});
    expect(screen.queryByTestId("guide-close")).toBeNull();
  });
});
