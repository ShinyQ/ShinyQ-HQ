// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { lazy, Suspense, type ComponentType } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogHost } from "@/components/DialogHost";
import type { CertView } from "@/content/certs";
import { openCert, openGuide } from "@/hud/events";

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
// Stand-ins for the lazy dialog chunks: the cert card's action opens the guide, as the real CertDialog will.
vi.mock("@/components/dialog-loaders", () => ({
  loadCvDialog: async () => ({ default: () => null }),
  loadPaperDialog: async () => ({ default: () => null }),
  loadCertDialog: async () => ({
    default: ({ cert }: { cert: CertView }) => (
      <button type="button" data-testid="cert-read" onClick={() => openGuide(cert.guide ?? "")}>
        Read study guide
      </button>
    ),
  }),
  loadGuideDialog: async () => ({
    default: ({ slug, onClose }: { slug: string; onClose: () => void }) => (
      <button type="button" data-testid="guide-close" data-slug={slug} onClick={onClose}>
        Close
      </button>
    ),
  }),
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
    act(() => openGuide("gcp-pca"));
    const close = await screen.findByTestId("guide-close");
    expect(close).toHaveAttribute("data-slug", "gcp-pca");
    close.focus();
    fireEvent.click(close);
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
