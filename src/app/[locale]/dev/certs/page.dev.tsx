import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { Certifications } from "@/components/certs/Certifications";
import { CertPreviewHost } from "@/components/certs/CertPreview";
import { SectionSplit } from "@/components/page/Layout";
import { certViews, toCertViews } from "@/content/cert-views";
import { experienceDataFor } from "@/experience/gate-data";
import { CertsDevLoader } from "@/experience/prototype/certs/CertsDev";
import { CERT_FIXTURE } from "@/experience/prototype/certs/fixture";
import { assertLocale } from "@/i18n/locale";

/**
 * Dev-only route (see next.config.ts): the shipped certification layouts with live content and with
 * the 30-entry scale fixture, at /{locale}/dev/certs. ?view=3d&n=7|30&tier=lite|full shows the L1 wall.
 */
export const metadata: Metadata = { title: "Certifications at scale", robots: { index: false, follow: false } };

const wallShape = ({ id, code, name, short, issuer, logo, issued, issuedLabel, status, url }: ReturnType<typeof certViews>[number]) => ({ id, code, name, short, issuer, logo, issued, issuedLabel, status, url });

export default async function CertsDevPage({ params }: { params: Promise<{ locale: string }> }) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  // Prefixed ids, so the layout's live preview host never answers a fixture click.
  const fixture = toCertViews(CERT_FIXTURE, locale).map((c) => ({ ...c, id: `fixture-${c.id}` }));
  return (
    <div data-testid="certs-dev">
      <SectionSplit id="certifications" title="Live content">
        <Certifications locale={locale} />
      </SectionSplit>
      <SectionSplit id="fixture-home" title="Fixture (30), home summary">
        <Certifications locale={locale} certs={fixture} limit={6} />
      </SectionSplit>
      <SectionSplit id="fixture-full" title="Fixture (30), full list">
        <Certifications locale={locale} certs={fixture} />
      </SectionSplit>
      <CertPreviewHost certs={fixture} />
      <CertsDevLoader data={await experienceDataFor(locale)} sets={{ live: certViews(locale).map(wallShape), fixture: fixture.map(wallShape) }} />
    </div>
  );
}
