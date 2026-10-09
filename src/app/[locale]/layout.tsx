import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import { getProfile } from "@/content/load";
import { assertLocale } from "@/i18n/locale";
import { routing } from "@/i18n/routing";
import { SITE_URL, pageMetadata } from "@/lib/site";
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
    metadataBase: new URL(SITE_URL),
    title: { default: base, template: `%s · ${t("siteName")}` },
    description: t("description"),
    authors: [{ name: profile.name }],
    ...pageMetadata({ locale, path: "/", description: t("description") }),
  };
}

export default async function LocaleLayout({ children, params }: LayoutProps<"/[locale]">) {
  const locale = assertLocale((await params).locale);
  setRequestLocale(locale);
  return (
    <html lang={locale} className={`${fontClassName} antialiased`}>
      <body className="flex min-h-screen flex-col">
        <NextIntlClientProvider>
          <SiteHeader locale={locale} />
          <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
            {children}
          </main>
          <SiteFooter locale={locale} />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
