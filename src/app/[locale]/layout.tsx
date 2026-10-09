import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Analytics } from "@/components/Analytics";
import { JsonLd } from "@/components/JsonLd";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getContent, getProfile } from "@/content/load";
import { buildHudIndex } from "@/hud/index-data";
import { MissionHud } from "@/hud/MissionHud";
import { assertLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { personJsonLd, websiteJsonLd } from "@/lib/jsonld";
import { SITE_NAME, SITE_URL, pageMetadata } from "@/lib/site";
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
  const t = await getTranslations({ locale, namespace: "meta" });
  const profile = getProfile();
  const base = `${profile.name} · ${profile.headline[locale]}`;
  return {
    ...pageMetadata({ locale, path: "/", title: base, description: t("description") }),
    metadataBase: new URL(SITE_URL),
    title: { default: base, template: `%s · ${t("siteName")}` },
    applicationName: SITE_NAME,
    authors: [{ name: profile.name, url: `${SITE_URL}/${locale}` }],
    creator: profile.name,
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <html lang={locale} className={`${fontClassName} antialiased`}>
      <body>
        <NextIntlClientProvider>
          {/* The 3D overlay marks this shell inert while it is open (see ExperienceGate). */}
          <div id="site-shell" className="flex min-h-screen flex-col">
            <SiteHeader locale={locale} />
            <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
              {children}
            </main>
            <SiteFooter locale={locale} />
          </div>
          {/* Outside the shell so the Rover Terminal and palette stay usable over the 3D tower. */}
          <MissionHud locale={locale} index={buildHudIndex(getContent())} />
        </NextIntlClientProvider>
        <JsonLd data={[personJsonLd(locale), websiteJsonLd(locale)]} />
        <Analytics />
      </body>
    </html>
  );
}
