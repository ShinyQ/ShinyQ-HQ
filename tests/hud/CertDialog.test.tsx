// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";
import en from "../../messages/en.json";
import id from "../../messages/id.json";
import CertDialog from "@/components/certs/CertDialog";
import type { CertView } from "@/content/certs";

afterEach(() => cleanup());

/** A fictional certification: only the status matters here. */
const cert = (status: CertView["status"]): CertView => ({
  id: "example-cert",
  code: "EX-100",
  name: "Example Certified: Test Associate",
  short: "Test Associate",
  issuer: "Example Org",
  logo: null,
  issued: "2025-01",
  issuedLabel: "Jan 2025",
  expires: null,
  expiresLabel: null,
  status,
  url: null,
  credentialId: null,
  shortLabel: null,
  featured: false,
  guide: null,
});

describe("CertDialog (R5 P10)", () => {
  for (const [locale, messages, expiry, pending] of [
    ["en", en, "Expires", "No public credential link yet."],
    ["id", id, "Berlaku hingga", "Tautan kredensial publik belum tersedia."],
  ] as const) {
    it(`${locale}: labels expiresLabel as expiry and does not promise automatic publication`, () => {
      render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <CertDialog cert={{ ...cert("earned"), expires: "2027-01", expiresLabel: "Jan 2027" }} onClose={vi.fn()} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText(expiry).nextElementSibling).toHaveTextContent("Jan 2027");
    });

    it(`${locale}: reports a missing in-progress credential link without promising publication`, () => {
      render(
        <NextIntlClientProvider locale={locale} messages={messages}>
          <CertDialog cert={cert("in-progress")} onClose={vi.fn()} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByText(pending)).toBeInTheDocument();
      expect(screen.queryByTestId("cert-open")).toBeNull();
    });
  }
  for (const [status, label, tone] of [
    ["earned", "Earned", "text-green"],
    ["in-progress", "In progress", "text-amber"],
    ["expired", "Expired", "text-ink-3"],
  ] as const) {
    it(`shows "${label}" as a colored chip next to its label, with no colored top rule`, () => {
      render(
        <NextIntlClientProvider locale="en" messages={en}>
          <CertDialog cert={cert(status)} onClose={vi.fn()} />
        </NextIntlClientProvider>,
      );
      const dialog = screen.getByTestId("cert-dialog");
      expect(dialog.querySelector(".absolute.inset-x-0.top-0")).toBeNull();
      expect(within(dialog).getByText(label)).toHaveClass("pv-mark", tone);
    });
  }

  describe("study guide action", () => {
    const earned = { ...cert("earned"), url: "https://example.org/credential" };

    for (const [locale, messages, label] of [
      ["en", en, "Read study guide"],
      ["id", id, "Baca panduan belajar"],
    ] as const) {
      // DialogHost opens the reader from the delegated `[data-hq-guide]` click (tests/hud/DialogHost.test.tsx).
      it(`${locale}: with a guide, a primary Read button opens the guide without closing the card first`, () => {
        const onClose = vi.fn();
        render(
          <NextIntlClientProvider locale={locale} messages={messages}>
            <CertDialog cert={{ ...earned, guide: "example-guide" }} onClose={onClose} />
          </NextIntlClientProvider>,
        );
        const read = screen.getByTestId("cert-read-guide");
        expect(read).toHaveTextContent(label);
        expect(read).toHaveClass("pv-btn", "pv-btn-primary");
        const open = screen.getByTestId("cert-open");
        expect(open).not.toHaveClass("pv-btn-primary");
        expect(read.compareDocumentPosition(open) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(read).toHaveAttribute("data-hq-guide", "example-guide");
        expect(read).toHaveAttribute("aria-haspopup", "dialog");
        fireEvent.click(read);
        expect(onClose).not.toHaveBeenCalled();
      });
    }

    it("without a guide renders no Read button and keeps the credential link primary", () => {
      render(
        <NextIntlClientProvider locale="en" messages={en}>
          <CertDialog cert={earned} onClose={vi.fn()} />
        </NextIntlClientProvider>,
      );
      expect(screen.queryByTestId("cert-read-guide")).toBeNull();
      expect(screen.getByTestId("cert-open")).toHaveClass("pv-btn-primary");
    });

    it("with a guide and no credential link still offers the guide", () => {
      render(
        <NextIntlClientProvider locale="en" messages={en}>
          <CertDialog cert={{ ...cert("in-progress"), guide: "example-guide" }} onClose={vi.fn()} />
        </NextIntlClientProvider>,
      );
      expect(screen.getByTestId("cert-read-guide")).toBeInTheDocument();
      expect(screen.getByText("No public credential link yet.")).toBeInTheDocument();
    });
  });
});
