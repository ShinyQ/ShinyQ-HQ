import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Analytics } from "@/components/Analytics";
import { VisitBeacon } from "@/components/VisitBeacon";
import { BootCover } from "@/components/BootCover";
import { DialogHost } from "@/components/DialogHost";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getContent, getProfile } from "@/content/load";
import { roleLine } from "@/content/selectors";
import { AskDock } from "@/hud/ask/AskDock";
import { buildHudIndex, hudIndexVersion } from "@/hud/index-data";
import { MissionHud } from "@/hud/MissionHud";
import { LAYOUT_NAMESPACES, pickMessages } from "@/i18n/client-messages";
import { assertLocale } from "@/i18n/locale";
import { bootFirstScript } from "@/lib/boot-first";
import { routing } from "@/i18n/routing";
import { personJsonLd, websiteJsonLd } from "@/lib/jsonld";
import { seoFor, seoMetadata } from "@/lib/seo";
import { SITE_NAME, SITE_URL } from "@/lib/site";
import { fontClassName } from "../fonts";
import "../globals.css";

export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const viewport: Viewport = {
  themeColor: "#05050c",
  colorScheme: "dark",
};

export async function generateMetadata({ params }: LayoutProps<"/[locale]">): Promise<Metadata> {
  const locale = assertLocale((await params).locale);
  const profile = getProfile();
  const home = seoFor(locale, "/");
  return {
    ...seoMetadata(locale, "/"),
    metadataBase: new URL(SITE_URL),
    title: { default: home.searchTitle, template: "%s" },
    applicationName: SITE_NAME,
    authors: [{ name: profile.name, url: `${SITE_URL}/${locale}` }],
    creator: profile.name,
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  const profile = getProfile();
  const messages = pickMessages(await getMessages(), LAYOUT_NAMESPACES);
  return (
    // The inline script sets data-hq-boot on <html> before hydration, hence suppressHydrationWarning.
    <html lang={locale} className={`${fontClassName} antialiased`} suppressHydrationWarning>
      <head>
        {/* Runs before first paint: on 3D-capable visits the boot cover hides the Page View. */}
        <script dangerouslySetInnerHTML={{ __html: bootFirstScript() }} />
      </head>
      <body>
        <BootCover
          locale={locale}
          who={{ name: profile.name, headline: profile.headline[locale], motto: profile.subheadline[locale], role: roleLine(profile.currentRole, locale) }}
        />
        {/* Only the namespaces the layout's client islands read; pages add theirs (src/i18n/client-messages.ts). */}
        <NextIntlClientProvider messages={messages}>
          {/* The 3D overlay marks this shell inert while it is open (see ExperienceGate). */}
          <div id="site-shell" className="flex min-h-screen flex-col">
            <SiteHeader locale={locale} />
            <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
              {children}
            </main>
            <SiteFooter locale={locale} />
          </div>
          {/* Outside the shell so the Rover Terminal and palette stay usable over the 3D tower. Its index
              (rooms, missions) is fetched from /data/hud/index.json after hydration, not inlined. */}
          <MissionHud locale={locale} indexVersion={hudIndexVersion(buildHudIndex(getContent()))} />
          <AskDock locale={locale} />
          <DialogHost />
        </NextIntlClientProvider>
        <JsonLd data={[personJsonLd(locale), websiteJsonLd(locale)]} />
        <Analytics />
        <VisitBeacon />
      </body>
    </html>
  );
}
